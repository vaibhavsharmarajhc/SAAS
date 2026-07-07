/**
 * VSH Legal Practice Manager - Multi-Tenant Hybrid Database Layer
 * Supports MongoDB Cloud connection with automatic fallback to local JSON file.
 */

const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');
const { MongoClient } = require('mongodb');

const dbPath = path.join(__dirname, 'database.json');

// Default empty schema structure for local file database fallback
const DEFAULT_SCHEMA = {
  tenants: [],
  clients: [],
  cases: [],
  transactions: []
};

// MongoDB connection management
const uri = process.env.MONGODB_URI;
let client = null;
let mongoDbInstance = null;

async function getDb() {
  if (!uri) {
    return null; // Local JSON file fallback mode
  }
  try {
    if (!client) {
      client = new MongoClient(uri);
      await client.connect();
      mongoDbInstance = client.db();
      console.log("Connected successfully to MongoDB cloud instance.");
    }
    return mongoDbInstance;
  } catch (err) {
    console.error("MongoDB Connection failed. Falling back to JSON database file.", err);
    return null;
  }
}

// Map MongoDB _id to standard API id for frontend compatibility
function mapId(doc) {
  if (!doc) return null;
  const { _id, ...rest } = doc;
  return { id: _id, ...rest };
}

function mapIds(docs) {
  return docs.map(mapId);
}

// Convert standard API id to MongoDB _id key
function toMongoDoc(obj) {
  if (!obj) return null;
  const { id, ...rest } = obj;
  return { _id: id, ...rest };
}

/**
 * File Database Fallback Helpers
 */
function readDb() {
  try {
    if (!fs.existsSync(dbPath)) {
      writeDb(DEFAULT_SCHEMA);
      return DEFAULT_SCHEMA;
    }
    const data = fs.readFileSync(dbPath, 'utf8');
    return JSON.parse(data);
  } catch (e) {
    console.error("Error reading JSON database file. Returning default schema.", e);
    return DEFAULT_SCHEMA;
  }
}

function writeDb(data) {
  try {
    const jsonStr = JSON.stringify(data, null, 2);
    const tempPath = dbPath + '.tmp';
    fs.writeFileSync(tempPath, jsonStr, 'utf8');
    fs.renameSync(tempPath, dbPath);
  } catch (e) {
    console.error("Failed to write to JSON database file.", e);
  }
}

/**
 * Initialize Database
 */
async function initDatabase() {
  const db = await getDb();
  if (db) {
    console.log("Persistence Layer: MongoDB Cloud Active.");
  } else {
    readDb();
    console.log("Persistence Layer: Local JSON Database initialized at: " + dbPath);
  }
}

/**
 * Tenant Account Management
 */
async function getTenantByEmail(email) {
  const db = await getDb();
  if (db) {
    const tenant = await db.collection('tenants').findOne({ email: email.toLowerCase() });
    return mapId(tenant);
  }
  
  const localDb = readDb();
  return localDb.tenants.find(t => t.email.toLowerCase() === email.toLowerCase()) || null;
}

async function getTenantById(id) {
  const db = await getDb();
  if (db) {
    const tenant = await db.collection('tenants').findOne({ _id: id });
    if (tenant) {
      const { passwordHash, ...safeTenant } = tenant;
      return { id: tenant._id, ...safeTenant };
    }
    return null;
  }

  const localDb = readDb();
  const tenant = localDb.tenants.find(t => t.id === id);
  if (tenant) {
    const { passwordHash, ...safeTenant } = tenant;
    return safeTenant;
  }
  return null;
}

async function createTenant(email, password, firmName, lawyerName) {
  const salt = bcrypt.genSaltSync(10);
  const passwordHash = bcrypt.hashSync(password, salt);
  const id = "t_" + Date.now();

  const newTenant = {
    id,
    email: email.toLowerCase(),
    passwordHash,
    settings: {
      firmName: firmName || "VSH Legal",
      lawyerName: lawyerName || "Adv. Vaibhav Sharma",
      currency: "INR",
      theme: "dark"
    }
  };

  const db = await getDb();
  if (db) {
    const existing = await db.collection('tenants').findOne({ email: email.toLowerCase() });
    if (existing) {
      throw new Error("A tenant with this email address already exists.");
    }
    await db.collection('tenants').insertOne(toMongoDoc(newTenant));
    await seedTenantData(id);
    const { passwordHash: _, ...safeTenant } = newTenant;
    return safeTenant;
  }

  const localDb = readDb();
  if (localDb.tenants.some(t => t.email.toLowerCase() === email.toLowerCase())) {
    throw new Error("A tenant with this email address already exists.");
  }
  localDb.tenants.push(newTenant);
  writeDb(localDb);
  await seedTenantData(id);
  const { passwordHash: _, ...safeTenant } = newTenant;
  return safeTenant;
}

async function updateTenantSettings(tenantId, settingsData) {
  const db = await getDb();
  if (db) {
    const tenant = await db.collection('tenants').findOne({ _id: tenantId });
    if (!tenant) throw new Error("Tenant settings update failed: Tenant not found.");
    const newSettings = { ...tenant.settings, ...settingsData };
    await db.collection('tenants').updateOne({ _id: tenantId }, { $set: { settings: newSettings } });
    return newSettings;
  }

  const localDb = readDb();
  const idx = localDb.tenants.findIndex(t => t.id === tenantId);
  if (idx !== -1) {
    localDb.tenants[idx].settings = { ...localDb.tenants[idx].settings, ...settingsData };
    writeDb(localDb);
    return localDb.tenants[idx].settings;
  }
  throw new Error("Tenant settings update failed: Tenant not found.");
}

/**
 * Client Management
 */
async function getClients(tenantId) {
  const db = await getDb();
  if (db) {
    const clients = await db.collection('clients').find({ tenantId }).toArray();
    return mapIds(clients);
  }

  const localDb = readDb();
  return localDb.clients.filter(c => c.tenantId === tenantId);
}

async function getClient(tenantId, id) {
  const db = await getDb();
  if (db) {
    const client = await db.collection('clients').findOne({ tenantId, _id: id });
    return mapId(client);
  }

  const localDb = readDb();
  return localDb.clients.find(c => c.tenantId === tenantId && c.id === id) || null;
}

async function addClient(tenantId, clientData) {
  const newClient = {
    id: "c_" + Date.now(),
    tenantId,
    name: clientData.name || "",
    type: clientData.type || "Individual",
    email: clientData.email || "",
    phone: clientData.phone || "",
    address: clientData.address || "",
    onboardingDate: clientData.onboardingDate || new Date().toISOString().split('T')[0],
    notes: clientData.notes || ""
  };

  const db = await getDb();
  if (db) {
    await db.collection('clients').insertOne(toMongoDoc(newClient));
    return newClient;
  }

  const localDb = readDb();
  localDb.clients.push(newClient);
  writeDb(localDb);
  return newClient;
}

async function updateClient(tenantId, id, clientData) {
  const db = await getDb();
  if (db) {
    const client = await db.collection('clients').findOne({ tenantId, _id: id });
    if (!client) return null;
    const { id: _, tenantId: __, ...updData } = clientData;
    const updatedClient = { ...client, ...updData };
    await db.collection('clients').updateOne({ tenantId, _id: id }, { $set: toMongoDoc(updatedClient) });
    return mapId(toMongoDoc(updatedClient));
  }

  const localDb = readDb();
  const idx = localDb.clients.findIndex(c => c.tenantId === tenantId && c.id === id);
  if (idx !== -1) {
    localDb.clients[idx] = { ...localDb.clients[idx], ...clientData, id, tenantId };
    writeDb(localDb);
    return localDb.clients[idx];
  }
  return null;
}

async function deleteClient(tenantId, id) {
  const db = await getDb();
  if (db) {
    await db.collection('clients').deleteOne({ tenantId, _id: id });
    await db.collection('cases').deleteMany({ tenantId, clientId: id });
    await db.collection('transactions').deleteMany({ tenantId, clientId: id });
    return;
  }

  const localDb = readDb();
  localDb.clients = localDb.clients.filter(c => !(c.tenantId === tenantId && c.id === id));
  localDb.cases = localDb.cases.filter(c => !(c.tenantId === tenantId && c.clientId === id));
  localDb.transactions = localDb.transactions.filter(t => !(t.tenantId === tenantId && t.clientId === id));
  writeDb(localDb);
}

/**
 * Case Management
 */
async function getCases(tenantId) {
  const db = await getDb();
  if (db) {
    const cases = await db.collection('cases').find({ tenantId }).toArray();
    return mapIds(cases);
  }

  const localDb = readDb();
  return localDb.cases.filter(c => c.tenantId === tenantId);
}

async function getCase(tenantId, id) {
  const db = await getDb();
  if (db) {
    const cs = await db.collection('cases').findOne({ tenantId, _id: id });
    return mapId(cs);
  }

  const localDb = readDb();
  return localDb.cases.find(c => c.tenantId === tenantId && c.id === id) || null;
}

async function addCase(tenantId, caseObj) {
  const newCase = {
    id: "case_" + Date.now(),
    tenantId,
    clientId: caseObj.clientId,
    caseNumber: caseObj.caseNumber || "N/A",
    title: caseObj.title || "",
    court: caseObj.court || "",
    caseType: caseObj.caseType || "Civil",
    referredBy: caseObj.referredBy || "Self",
    status: caseObj.status || "Active",
    stage: caseObj.stage || "Filing",
    nextHearingDate: caseObj.nextHearingDate || null,
    description: caseObj.description || "",
    hearings: caseObj.hearings || []
  };

  const db = await getDb();
  if (db) {
    await db.collection('cases').insertOne(toMongoDoc(newCase));
    return newCase;
  }

  const localDb = readDb();
  localDb.cases.push(newCase);
  writeDb(localDb);
  return newCase;
}

async function updateCase(tenantId, id, caseData) {
  const db = await getDb();
  if (db) {
    const cs = await db.collection('cases').findOne({ tenantId, _id: id });
    if (!cs) return null;
    const { id: _, tenantId: __, ...updData } = caseData;
    const updatedCase = { ...cs, ...updData };
    if (!caseData.hearings) {
      updatedCase.hearings = cs.hearings || [];
    }
    await db.collection('cases').updateOne({ tenantId, _id: id }, { $set: toMongoDoc(updatedCase) });
    return mapId(toMongoDoc(updatedCase));
  }

  const localDb = readDb();
  const idx = localDb.cases.findIndex(c => c.tenantId === tenantId && c.id === id);
  if (idx !== -1) {
    const existingHearings = localDb.cases[idx].hearings || [];
    localDb.cases[idx] = { ...localDb.cases[idx], ...caseData, id, tenantId };
    if (!caseData.hearings) {
      localDb.cases[idx].hearings = existingHearings;
    }
    writeDb(localDb);
    return localDb.cases[idx];
  }
  return null;
}

async function deleteCase(tenantId, id) {
  const db = await getDb();
  if (db) {
    await db.collection('cases').deleteOne({ tenantId, _id: id });
    await db.collection('transactions').deleteMany({ tenantId, caseId: id });
    return;
  }

  const localDb = readDb();
  localDb.cases = localDb.cases.filter(c => !(c.tenantId === tenantId && c.id === id));
  localDb.transactions = localDb.transactions.filter(t => !(t.tenantId === tenantId && t.caseId === id));
  writeDb(localDb);
}

async function addHearing(tenantId, caseId, hearingData) {
  const newHearing = {
    id: "h_" + Date.now(),
    date: hearingData.date || new Date().toISOString().split('T')[0],
    stage: hearingData.stage || "Hearing",
    notes: hearingData.notes || ""
  };

  const db = await getDb();
  if (db) {
    const cs = await db.collection('cases').findOne({ tenantId, _id: caseId });
    if (!cs) return null;
    const hearings = cs.hearings || [];
    hearings.push(newHearing);
    await db.collection('cases').updateOne(
      { tenantId, _id: caseId },
      { 
        $set: { 
          hearings,
          stage: hearingData.stage,
          nextHearingDate: hearingData.nextHearingDate || null
        } 
      }
    );
    const updated = await db.collection('cases').findOne({ tenantId, _id: caseId });
    return mapId(updated);
  }

  const localDb = readDb();
  const idx = localDb.cases.findIndex(c => c.tenantId === tenantId && c.id === caseId);
  if (idx !== -1) {
    localDb.cases[idx].hearings = localDb.cases[idx].hearings || [];
    localDb.cases[idx].hearings.push(newHearing);
    localDb.cases[idx].stage = hearingData.stage;
    localDb.cases[idx].nextHearingDate = hearingData.nextHearingDate || null;
    writeDb(localDb);
    return localDb.cases[idx];
  }
  return null;
}

/**
 * Transaction Management
 */
async function getTransactions(tenantId) {
  const db = await getDb();
  if (db) {
    const transactions = await db.collection('transactions').find({ tenantId }).toArray();
    return mapIds(transactions);
  }

  const localDb = readDb();
  return localDb.transactions.filter(t => t.tenantId === tenantId);
}

async function addTransaction(tenantId, tx) {
  const newTx = {
    id: "t_" + Date.now(),
    tenantId,
    clientId: tx.clientId,
    caseId: tx.caseId || null,
    date: tx.date || new Date().toISOString().split('T')[0],
    amount: parseFloat(tx.amount) || 0,
    type: tx.type || "Billed",
    description: tx.description || ""
  };

  const db = await getDb();
  if (db) {
    await db.collection('transactions').insertOne(toMongoDoc(newTx));
    return newTx;
  }

  const localDb = readDb();
  localDb.transactions.push(newTx);
  writeDb(localDb);
  return newTx;
}

async function deleteTransaction(tenantId, id) {
  const db = await getDb();
  if (db) {
    await db.collection('transactions').deleteOne({ tenantId, _id: id });
    return;
  }

  const localDb = readDb();
  localDb.transactions = localDb.transactions.filter(t => !(t.tenantId === tenantId && t.id === id));
  writeDb(localDb);
}

/**
 * Database Seeder
 */
async function seedTenantData(tenantId) {
  const clients = [
    {
      id: "c_1",
      tenantId,
      name: "Acme Corporates India",
      type: "Corporate",
      email: "legal@acmeindia.com",
      phone: "+919810012345",
      address: "DLF Cyber City, Phase III, Sector 24, Gurugram, Haryana",
      onboardingDate: "2026-01-15",
      notes: "Corporate commercial contracts and active arbitration panels."
    },
    {
      id: "c_2",
      tenantId,
      name: "Rajesh K. Singhania",
      type: "Individual",
      email: "rajesh@singhanialaw.in",
      phone: "+919871122334",
      address: "12A, Barakhamba Road, Connaught Place, New Delhi",
      onboardingDate: "2026-02-10",
      notes: "Civil property disputes regarding ancestral land in Greater Noida."
    },
    {
      id: "c_3",
      tenantId,
      name: "Stellar Tech Solutions",
      type: "Corporate",
      email: "contact@stellartech.io",
      phone: "+919560099887",
      address: "Okhla Industrial Area Phase 3, New Delhi",
      onboardingDate: "2026-03-05",
      notes: "IPR filings and employment contract disputes."
    },
    {
      id: "c_4",
      tenantId,
      name: "Meera Sen",
      type: "Individual",
      email: "meera.sen@gmail.com",
      phone: "+919999888777",
      address: "Apartment 704, Green Glen Layout, Outer Ring Road, Bangalore",
      onboardingDate: "2026-04-18",
      notes: "Consumer court appeal regarding flat possession delay."
    },
    {
      id: "c_5",
      tenantId,
      name: "Advait Malhotra",
      type: "Individual",
      email: "advait@malhotragroup.co",
      phone: "+919111222333",
      address: "Sector 15, Noida, Uttar Pradesh",
      onboardingDate: "2026-05-12",
      notes: "Summary suit recovery of dues from a vendor."
    }
  ];

  const cases = [
    {
      id: "case_1",
      tenantId,
      clientId: "c_1",
      caseNumber: "ARB/524/2026",
      title: "Acme Corporates vs. Buildwell Infrastructure",
      court: "Delhi High Court (Arbitration Bench)",
      caseType: "Contracts",
      referredBy: "Advocate Gupta",
      status: "Active",
      stage: "Arguments",
      nextHearingDate: "2026-06-25",
      description: "Arbitration proceeding regarding breach of contract and delay in construction project.",
      hearings: [
        { id: "h1_1", date: "2026-01-20", stage: "Filing", notes: "Section 11 petition filed for appointment of arbitrator." },
        { id: "h1_2", date: "2026-03-10", stage: "Evidence", notes: "Evidence of Plaintiff completed. Cross-examination done." },
        { id: "h1_3", date: "2026-05-15", stage: "Arguments", notes: "Final arguments commenced by the claimant (Acme)." }
      ]
    },
    {
      id: "case_2",
      tenantId,
      clientId: "c_2",
      caseNumber: "CS(OS)/342/2026",
      title: "Rajesh Singhania vs. Mahender Singhania & Ors.",
      court: "District Court, Saket (Civil Division)",
      caseType: "Civil",
      referredBy: "Self",
      status: "Active",
      stage: "Evidence",
      nextHearingDate: "2026-06-22",
      description: "Partition suit for ancestral commercial property situated in Saket, New Delhi.",
      hearings: [
        { id: "h2_1", date: "2026-02-18", stage: "Filing", notes: "Suit filed. Ad-interim injunction application argued." },
        { id: "h2_2", date: "2026-04-05", stage: "Framing of Issues", notes: "Written statement taken on record. Trial issues framed." },
        { id: "h2_3", date: "2026-05-22", stage: "Evidence", notes: "Plaintiff's chief examination completed. Summoned witnesses present." }
      ]
    },
    {
      id: "case_3",
      tenantId,
      clientId: "c_3",
      caseNumber: "COMM/105/2026",
      title: "Stellar Tech vs. AppWorks Enterprises",
      court: "Patiala House Courts (Commercial Bench)",
      caseType: "Contracts",
      referredBy: "Advocate Gupta",
      status: "Active",
      stage: "Interlocutory Application",
      nextHearingDate: "2026-06-21",
      description: "Suit for permanent injunction and damages for infringement of software copyright.",
      hearings: [
        { id: "h3_1", date: "2026-03-12", stage: "Filing", notes: "Suit filed along with urgent application under Order 39 Rules 1 & 2." },
        { id: "h3_2", date: "2026-04-20", stage: "Written Statement", notes: "Written statement filed by Defendant. Replication filed by Plaintiff." },
        { id: "h3_3", date: "2026-05-28", stage: "Interlocutory Application", notes: "Arguments heard on injunction. Matter listed today for orders." }
      ]
    },
    {
      id: "case_4",
      tenantId,
      clientId: "c_4",
      caseNumber: "CC/891/2026",
      title: "Meera Sen vs. Royal Developers Pvt. Ltd.",
      court: "State Consumer Disputes Redressal Commission, Delhi",
      caseType: "Consumer",
      referredBy: "Self",
      status: "Active",
      stage: "Filing of Rejoinder",
      nextHearingDate: "2026-07-05",
      description: "Complaint claiming refund and heavy interest for 3-year delay in handing over flat possession.",
      hearings: [
        { id: "h4_1", date: "2026-04-25", stage: "Admission", notes: "Complaint admitted. Notice issued to builder to file reply within 30 days." },
        { id: "h4_2", date: "2026-06-02", stage: "Builder Reply", notes: "Builder filed reply. Delay attributed to force majeure. Rejoinder copy to be prepared." }
      ]
    },
    {
      id: "case_5",
      tenantId,
      clientId: "c_5",
      caseNumber: "CS/7723/2026",
      title: "Advait Malhotra vs. Prime Steel Distributors",
      court: "District Court, Rohini",
      caseType: "Civil",
      referredBy: "Advocate Verma",
      status: "Active",
      stage: "Summons for Judgment",
      nextHearingDate: "2026-06-23",
      description: "Order 37 summary suit for recovery of INR 18,50,000 for steel supply outstanding invoices.",
      hearings: [
        { id: "h5_1", date: "2026-05-18", stage: "Filing", notes: "Summary suit filed. Summons of appearance issued to defendant." },
        { id: "h5_2", date: "2026-06-10", stage: "Summons of Appearance", notes: "Defendant entered appearance. Application for summons of judgment filed." }
      ]
    },
    {
      id: "case_6",
      tenantId,
      clientId: "c_2",
      caseNumber: "CRIM/1209/2026",
      title: "State (Govt of NCT Delhi) vs. Sanjay Kumar",
      court: "Metropolitan Magistrate, Saket",
      caseType: "Criminal",
      referredBy: "Self",
      status: "Closed",
      stage: "Verdict",
      nextHearingDate: null,
      description: "Defense of Sanjay Kumar (manager under Rajesh Singhania) in an alleged cheque bounce matter under Section 138 NI Act.",
      hearings: [
        { id: "h6_1", date: "2026-02-22", stage: "Defense Evidence", notes: "Defense witnesses examined and cross-examined." },
        { id: "h6_2", date: "2026-03-30", stage: "Arguments", notes: "Final arguments of prosecution and defense completed." },
        { id: "h6_3", date: "2026-04-15", stage: "Verdict", notes: "Accused acquitted. Cheque details proven to be security cheques without liability. Bail bonds discharged." }
      ]
    }
  ];

  const transactions = [
    { id: "t_1", tenantId, clientId: "c_1", caseId: "case_1", date: "2026-01-16", amount: 150000, type: "Billed", description: "Arbitration Drafting Retainer Fee" },
    { id: "t_2", tenantId, clientId: "c_1", caseId: "case_1", date: "2026-01-20", amount: 100000, type: "Received", description: "Payment for Arbitration Drafting Retainer" },
    { id: "t_3", tenantId, clientId: "c_2", caseId: "case_2", date: "2026-02-12", amount: 200000, type: "Billed", description: "Civil Suit Partition Retainer & Court Fees" },
    { id: "t_4", tenantId, clientId: "c_2", caseId: "case_2", date: "2026-02-15", amount: 150000, type: "Received", description: "Payment for Partition Suit Retainer" },
    { id: "t_5", tenantId, clientId: "c_2", caseId: "case_6", date: "2026-02-22", amount: 75000, type: "Billed", description: "Section 138 Defense trial advocacy fee" },
    { id: "t_6", tenantId, clientId: "c_3", caseId: "case_3", date: "2026-03-08", amount: 120000, type: "Billed", description: "Copyright Infringement Retainer" },
    { id: "t_7", tenantId, clientId: "c_3", caseId: "case_3", date: "2026-03-12", amount: 110000, type: "Received", description: "Copyright Infringement Initial Advance" },
    { id: "t_8", tenantId, clientId: "c_4", caseId: "case_4", date: "2026-04-20", amount: 300000, type: "Billed", description: "Consumer Commission Appeal Filing & Advocacy Fee" },
    { id: "t_9", tenantId, clientId: "c_4", caseId: "case_4", date: "2026-04-22", amount: 220000, type: "Received", description: "Consumer Suit Advance Payment" },
    { id: "t_10", tenantId, clientId: "c_2", caseId: "case_6", date: "2026-04-25", amount: 75000, type: "Received", description: "Clearing balance for Sec 138 trial" },
    { id: "t_11", tenantId, clientId: "c_5", caseId: "case_5", date: "2026-05-15", amount: 180000, type: "Billed", description: "Summary Suit Recovery Legal Fee" },
    { id: "t_12", tenantId, clientId: "c_5", caseId: "case_5", date: "2026-05-18", amount: 120000, type: "Received", description: "Payment towards summary suit retainer" },
    { id: "t_13", tenantId, clientId: "c_1", caseId: "case_1", date: "2026-05-20", amount: 90000, type: "Received", description: "Clearing outstanding from Section 11 filing" },
    { id: "t_14", tenantId, clientId: "c_1", caseId: "case_1", date: "2026-06-10", amount: 250000, type: "Billed", description: "Advocacy fee for Arbitration evidence & arguments" },
    { id: "t_15", tenantId, clientId: "c_1", caseId: "case_1", date: "2026-06-15", amount: 190000, type: "Received", description: "Payment for evidence hearings" }
  ];

  const db = await getDb();
  if (db) {
    await db.collection('clients').insertMany(clients.map(toMongoDoc));
    await db.collection('cases').insertMany(cases.map(toMongoDoc));
    await db.collection('transactions').insertMany(transactions.map(toMongoDoc));
    return;
  }

  const localDb = readDb();
  localDb.clients.push(...clients);
  localDb.cases.push(...cases);
  localDb.transactions.push(...transactions);
  writeDb(localDb);
}

/**
 * Backup Snapshot Restore
 */
async function importTenantBackup(tenantId, backupData) {
  const db = await getDb();
  if (db) {
    await db.collection('clients').deleteMany({ tenantId });
    await db.collection('cases').deleteMany({ tenantId });
    await db.collection('transactions').deleteMany({ tenantId });

    const clients = (backupData.clients || []).map(c => toMongoDoc({ ...c, tenantId }));
    const cases = (backupData.cases || []).map(c => toMongoDoc({ ...c, tenantId }));
    const transactions = (backupData.transactions || []).map(t => toMongoDoc({ ...t, tenantId }));

    if (clients.length > 0) await db.collection('clients').insertMany(clients);
    if (cases.length > 0) await db.collection('cases').insertMany(cases);
    if (transactions.length > 0) await db.collection('transactions').insertMany(transactions);
    return;
  }

  const localDb = readDb();
  localDb.clients = localDb.clients.filter(c => c.tenantId !== tenantId);
  localDb.cases = localDb.cases.filter(c => c.tenantId !== tenantId);
  localDb.transactions = localDb.transactions.filter(t => t.tenantId !== tenantId);

  const clients = (backupData.clients || []).map(c => ({ ...c, tenantId }));
  const cases = (backupData.cases || []).map(c => ({ ...c, tenantId }));
  const transactions = (backupData.transactions || []).map(t => ({ ...t, tenantId }));

  localDb.clients.push(...clients);
  localDb.cases.push(...cases);
  localDb.transactions.push(...transactions);
  writeDb(localDb);
}

module.exports = {
  initDatabase,
  getTenantByEmail,
  getTenantById,
  createTenant,
  updateTenantSettings,
  getClients,
  getClient,
  addClient,
  updateClient,
  deleteClient,
  getCases,
  getCase,
  addCase,
  updateCase,
  deleteCase,
  addHearing,
  getTransactions,
  addTransaction,
  deleteTransaction,
  importTenantBackup
};
