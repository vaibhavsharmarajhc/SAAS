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
  transactions: [],
  colleagues: [],
  tasks: []
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
    const parsed = JSON.parse(data);
    parsed.colleagues = parsed.colleagues || [];
    parsed.tasks = parsed.tasks || [];
    return parsed;
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
    try {
      await db.collection('tenants').createIndex({ email: 1 });
      await db.collection('clients').createIndex({ tenantId: 1 });
      await db.collection('cases').createIndex({ tenantId: 1 });
      await db.collection('transactions').createIndex({ tenantId: 1 });
      await db.collection('colleagues').createIndex({ tenantId: 1 });
      await db.collection('colleagues').createIndex({ colleagueId: 1 });
      await db.collection('tasks').createIndex({ tenantId: 1 });
      await db.collection('tasks').createIndex({ assigneeId: 1 });
      console.log("Database performance indexes initialized successfully.");
    } catch (indexErr) {
      console.error("Index initialization failed:", indexErr);
    }
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

async function setTenantResetCode(email, code, expires) {
  const db = await getDb();
  if (db) {
    await db.collection('tenants').updateOne(
      { email: email.toLowerCase() },
      { 
        $set: { 
          resetCode: code,
          resetCodeExpires: expires
        } 
      }
    );
    return true;
  }

  const localDb = readDb();
  const idx = localDb.tenants.findIndex(t => t.email.toLowerCase() === email.toLowerCase());
  if (idx !== -1) {
    localDb.tenants[idx].resetCode = code;
    localDb.tenants[idx].resetCodeExpires = expires;
    writeDb(localDb);
    return true;
  }
  return false;
}

async function resetTenantPassword(email, code, newPasswordHash) {
  const db = await getDb();
  if (db) {
    const tenant = await db.collection('tenants').findOne({ email: email.toLowerCase() });
    if (!tenant) return false;
    
    if (tenant.resetCode !== code || tenant.resetCodeExpires < Date.now()) {
      return false;
    }

    await db.collection('tenants').updateOne(
      { email: email.toLowerCase() },
      { 
        $set: { passwordHash: newPasswordHash },
        $unset: { resetCode: "", resetCodeExpires: "" }
      }
    );
    return true;
  }

  const localDb = readDb();
  const idx = localDb.tenants.findIndex(t => t.email.toLowerCase() === email.toLowerCase());
  if (idx !== -1) {
    const tenant = localDb.tenants[idx];
    if (tenant.resetCode !== code || tenant.resetCodeExpires < Date.now()) {
      return false;
    }
    localDb.tenants[idx].passwordHash = newPasswordHash;
    delete localDb.tenants[idx].resetCode;
    delete localDb.tenants[idx].resetCodeExpires;
    writeDb(localDb);
    return true;
  }
  return false;
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
      firmName: firmName || "Track My Chambers",
      lawyerName: lawyerName || "Adv. Vaibhav Sharma",
      currency: "INR",
      theme: "light"
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
    nextStage: hearingData.nextStage || null,
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
          stage: hearingData.nextStage || hearingData.stage,
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
    localDb.cases[idx].stage = hearingData.nextStage || hearingData.stage;
    localDb.cases[idx].nextHearingDate = hearingData.nextHearingDate || null;
    writeDb(localDb);
    return localDb.cases[idx];
  }
  return null;
}

async function updateHearing(tenantId, caseId, hearingId, hearingData) {
  const db = await getDb();
  if (db) {
    const cs = await db.collection('cases').findOne({ tenantId, _id: caseId });
    if (!cs) return null;

    const hearings = cs.hearings || [];
    const idx = hearings.findIndex(h => h.id === hearingId);
    if (idx !== -1) {
      hearings[idx] = {
        ...hearings[idx],
        date: hearingData.date || hearings[idx].date,
        stage: hearingData.stage || hearings[idx].stage,
        notes: hearingData.notes !== undefined ? hearingData.notes : hearings[idx].notes
      };

      await db.collection('cases').updateOne(
        { tenantId, _id: caseId },
        { $set: { hearings } }
      );
      
      const updated = await db.collection('cases').findOne({ tenantId, _id: caseId });
      return mapId(updated);
    }
    return null;
  }

  const localDb = readDb();
  const idx = localDb.cases.findIndex(c => c.tenantId === tenantId && c.id === caseId);
  if (idx !== -1) {
    localDb.cases[idx].hearings = localDb.cases[idx].hearings || [];
    const hIdx = localDb.cases[idx].hearings.findIndex(h => h.id === hearingId);
    if (hIdx !== -1) {
      localDb.cases[idx].hearings[hIdx] = {
        ...localDb.cases[idx].hearings[hIdx],
        date: hearingData.date || localDb.cases[idx].hearings[hIdx].date,
        stage: hearingData.stage || localDb.cases[idx].hearings[hIdx].stage,
        notes: hearingData.notes !== undefined ? hearingData.notes : localDb.cases[idx].hearings[hIdx].notes
      };
      writeDb(localDb);
      return localDb.cases[idx];
    }
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
  const clientsRaw = [
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

  const casesRaw = [
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

  const transactionsRaw = [
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

  const clients = clientsRaw.map(c => ({
    ...c,
    id: `${c.id}_${tenantId}`,
    tenantId
  }));

  const cases = casesRaw.map(cs => ({
    ...cs,
    id: `${cs.id}_${tenantId}`,
    tenantId,
    clientId: `${cs.clientId}_${tenantId}`,
    hearings: (cs.hearings || []).map(h => ({
      ...h,
      id: `${h.id}_${tenantId}`
    }))
  }));

  const transactions = transactionsRaw.map(t => ({
    ...t,
    id: `${t.id}_${tenantId}`,
    tenantId,
    clientId: `${t.clientId}_${tenantId}`,
    caseId: t.caseId ? `${t.caseId}_${tenantId}` : null
  }));

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

/**
 * Colleague & Team Management
 */
async function getColleagues(tenantId) {
  const db = await getDb();
  if (db) {
    const colleagues = await db.collection('colleagues').find({ tenantId }).toArray();
    const repaired = [];
    for (let c of colleagues) {
      if ((!c.colleagueId || c.colleagueId === 'undefined') && c.colleagueEmail) {
        try {
          const tenantObj = await getTenantByEmail(c.colleagueEmail);
          if (tenantObj) {
            c.colleagueId = tenantObj.id;
            await db.collection('colleagues').updateOne({ _id: c._id }, { $set: { colleagueId: tenantObj.id } });
            console.log(`Database self-healing: Repaired colleagueId for ${c.colleagueEmail}`);
          }
        } catch (err) {
          console.error("Database self-healing repair failed:", err);
        }
      }
      repaired.push(c);
    }
    return mapIds(repaired);
  }

  const localDb = readDb();
  localDb.colleagues = localDb.colleagues || [];
  let hasChanges = false;
  localDb.colleagues = localDb.colleagues.map(c => {
    if (c.tenantId === tenantId && (!c.colleagueId || c.colleagueId === 'undefined') && c.colleagueEmail) {
      const tenantObj = localDb.tenants.find(t => t.email.toLowerCase() === c.colleagueEmail.toLowerCase());
      if (tenantObj) {
        c.colleagueId = tenantObj.id;
        hasChanges = true;
        console.log(`Local database self-healing: Repaired colleagueId for ${c.colleagueEmail}`);
      }
    }
    return c;
  });

  if (hasChanges) {
    writeDb(localDb);
  }
  return localDb.colleagues.filter(c => c.tenantId === tenantId);
}

async function addColleague(tenantId, colleagueEmail, role = 'work', lawyerName = null) {
  const colleagueTenant = await getTenantByEmail(colleagueEmail);

  if (!colleagueTenant) {
    throw new Error("No registered account found with email '" + colleagueEmail + "'. Teammates must register first.");
  }

  const currentTenant = await getTenantById(tenantId);
  if (!currentTenant) {
    throw new Error("Main tenant not found.");
  }

  if (colleagueTenant.id === tenantId) {
    throw new Error("You cannot add yourself as a colleague.");
  }

  const existingColleagues = await getColleagues(tenantId);
  const alreadyAdded = existingColleagues.some(c => c.colleagueEmail.toLowerCase() === colleagueEmail.toLowerCase());
  if (alreadyAdded) {
    // If relation exists but colleagueId is broken/missing, self-healing will have restored it.
    // Return the relation record now.
    const record = existingColleagues.find(c => c.colleagueEmail.toLowerCase() === colleagueEmail.toLowerCase());
    if (record && record.colleagueId && record.colleagueId !== 'undefined') {
      // If role or custom name needs update
      let needsUpdate = false;
      const updates = {};
      if (record.role !== role) {
        record.role = role;
        updates.role = role;
        needsUpdate = true;
      }
      if (lawyerName && record.lawyerName !== lawyerName) {
        record.lawyerName = lawyerName;
        updates.lawyerName = lawyerName;
        needsUpdate = true;
      }
      if (needsUpdate) {
        const db = await getDb();
        if (db) {
          await db.collection('colleagues').updateOne({ _id: record.id }, { $set: updates });
        } else {
          const localDb = readDb();
          const rIdx = localDb.colleagues.findIndex(c => c.id === record.id);
          if (rIdx !== -1) {
            localDb.colleagues[rIdx] = { ...localDb.colleagues[rIdx], ...updates };
            writeDb(localDb);
          }
        }
      }
      return record;
    }
    throw new Error("This user is already in your team.");
  }

  const newColleagueRelation1 = {
    id: "col_" + Date.now() + "_1",
    tenantId: tenantId,
    colleagueId: colleagueTenant.id,
    colleagueEmail: colleagueTenant.email,
    lawyerName: lawyerName || colleagueTenant.lawyerName || "Teammate",
    firmName: colleagueTenant.firmName || "",
    role: role
  };

  const newColleagueRelation2 = {
    id: "col_" + Date.now() + "_2",
    tenantId: colleagueTenant.id,
    colleagueId: tenantId,
    colleagueEmail: currentTenant.email,
    lawyerName: currentTenant.lawyerName || "Teammate",
    firmName: currentTenant.firmName || "",
    role: 'work'
  };

  const db = await getDb();
  if (db) {
    await db.collection('colleagues').insertOne(toMongoDoc(newColleagueRelation1));
    await db.collection('colleagues').insertOne(toMongoDoc(newColleagueRelation2));
  } else {
    const localDb = readDb();
    localDb.colleagues = localDb.colleagues || [];
    localDb.colleagues.push(newColleagueRelation1);
    localDb.colleagues.push(newColleagueRelation2);
    writeDb(localDb);
  }

  return newColleagueRelation1;
}

/**
 * Todoist-style Tasks Management
 */
async function getTasks(tenantId) {
  const db = await getDb();
  if (db) {
    const tasks = await db.collection('tasks').find({
      $or: [
        { tenantId: tenantId },
        { assigneeId: tenantId },
        { assigneeId: "undefined" }
      ]
    }).toArray();

    const repaired = [];
    const directTaskIds = new Set();
    for (let t of tasks) {
      if (t.assigneeId === 'undefined' && t.assigneeEmail) {
        try {
          const tenantObj = await getTenantByEmail(t.assigneeEmail);
          if (tenantObj) {
            t.assigneeId = tenantObj.id;
            await db.collection('tasks').updateOne({ _id: t._id }, { $set: { assigneeId: tenantObj.id } });
            console.log(`Database self-healing: Repaired assigneeId for task ${t._id}`);
          }
        } catch (err) {
          console.error("Task self-healing repair failed:", err);
        }
      }
      if (t.tenantId === tenantId || t.assigneeId === tenantId) {
        repaired.push(t);
        directTaskIds.add(t._id);
      }
    }

    // Recursively query sub-delegated child tasks up to 3 levels deep
    let currentLevelIds = Array.from(directTaskIds);
    const allSubTasks = [];
    while (currentLevelIds.length > 0) {
      const subTasks = await db.collection('tasks').find({
        parentId: { $in: currentLevelIds }
      }).toArray();

      if (subTasks.length === 0) break;

      const newIds = [];
      for (let st of subTasks) {
        if (!directTaskIds.has(st._id)) {
          allSubTasks.push(st);
          directTaskIds.add(st._id);
          newIds.push(st._id);
        }
      }
      currentLevelIds = newIds;
    }

    const finalTasks = [...repaired, ...allSubTasks];
    for (let t of finalTasks) {
      try {
        const creatorObj = await getTenantById(t.tenantId);
        if (creatorObj) {
          t.creatorName = creatorObj.lawyerName || 'Unknown Owner';
          t.creatorEmail = creatorObj.email;
        } else {
          t.creatorName = 'System';
          t.creatorEmail = '';
        }
      } catch (err) {
        t.creatorName = 'System';
      }
    }

    return mapIds(finalTasks);
  }

  const localDb = readDb();
  localDb.tasks = localDb.tasks || [];
  let hasChanges = false;

  localDb.tasks = localDb.tasks.map(t => {
    if (t.assigneeId === 'undefined' && t.assigneeEmail) {
      const tenantObj = localDb.tenants.find(u => u.email.toLowerCase() === t.assigneeEmail.toLowerCase());
      if (tenantObj) {
        t.assigneeId = tenantObj.id;
        hasChanges = true;
        console.log(`Local task self-healing: Repaired assigneeId for task ${t.id}`);
      }
    }
    return t;
  });

  if (hasChanges) {
    writeDb(localDb);
  }

  // Local recursive search
  const directTasks = localDb.tasks.filter(t => t.tenantId === tenantId || t.assigneeId === tenantId);
  const directTaskIds = new Set(directTasks.map(t => t.id));

  let currentLevelIds = Array.from(directTaskIds);
  const allSubTasks = [];
  while (currentLevelIds.length > 0) {
    const subTasks = localDb.tasks.filter(t => currentLevelIds.includes(t.parentId));
    if (subTasks.length === 0) break;

    const newIds = [];
    for (let st of subTasks) {
      if (!directTaskIds.has(st.id)) {
        allSubTasks.push(st);
        directTaskIds.add(st.id);
        newIds.push(st.id);
      }
    }
    currentLevelIds = newIds;
  }

  const finalTasks = [...directTasks, ...allSubTasks];
  for (let t of finalTasks) {
    try {
      const creatorObj = localDb.tenants.find(u => u.id === t.tenantId);
      if (creatorObj) {
        t.creatorName = creatorObj.lawyerName || 'Unknown Owner';
        t.creatorEmail = creatorObj.email;
      } else {
        t.creatorName = 'System';
        t.creatorEmail = '';
      }
    } catch (err) {
      t.creatorName = 'System';
    }
  }

  return finalTasks;
}

async function getTask(tenantId, id) {
  const db = await getDb();
  if (db) {
    const taskObj = await db.collection('tasks').findOne({ _id: id });
    return mapId(taskObj);
  }

  const localDb = readDb();
  localDb.tasks = localDb.tasks || [];
  return localDb.tasks.find(t => t.id === id) || null;
}

async function addTask(tenantId, taskData) {
  const newTask = {
    id: "task_" + Date.now(),
    tenantId: tenantId,
    assigneeId: taskData.assigneeId || null,
    assigneeEmail: taskData.assigneeEmail || null,
    assigneeName: taskData.assigneeName || null,
    title: taskData.title || "Untitled Task",
    desc: taskData.desc || "",
    dueDate: taskData.dueDate || null,
    priority: taskData.priority || "P4",
    project: taskData.project || "Inbox",
    status: taskData.status || "pending",
    parentId: taskData.parentId || null,
    kanbanStatus: taskData.kanbanStatus || "todo",
    assignedAt: taskData.assigneeId ? new Date().toISOString() : null,
    completedAt: null,
    comments: [],
    createdAt: new Date().toISOString()
  };

  const db = await getDb();
  if (db) {
    await db.collection('tasks').insertOne(toMongoDoc(newTask));
    return newTask;
  }

  const localDb = readDb();
  localDb.tasks = localDb.tasks || [];
  localDb.tasks.push(newTask);
  writeDb(localDb);
  return newTask;
}

async function updateTask(tenantId, id, taskData) {
  const taskObj = await getTask(tenantId, id);
  if (!taskObj) {
    throw new Error("Task not found or access denied.");
  }

  const allowedUpdates = {};
  if (taskData.title !== undefined) allowedUpdates.title = taskData.title;
  if (taskData.desc !== undefined) allowedUpdates.desc = taskData.desc;
  if (taskData.dueDate !== undefined) allowedUpdates.dueDate = taskData.dueDate;
  if (taskData.priority !== undefined) allowedUpdates.priority = taskData.priority;
  if (taskData.project !== undefined) allowedUpdates.project = taskData.project;
  if (taskData.status !== undefined) allowedUpdates.status = taskData.status;
  if (taskData.assigneeId !== undefined) allowedUpdates.assigneeId = taskData.assigneeId;
  if (taskData.assigneeEmail !== undefined) allowedUpdates.assigneeEmail = taskData.assigneeEmail;
  if (taskData.assigneeName !== undefined) allowedUpdates.assigneeName = taskData.assigneeName;
  if (taskData.parentId !== undefined) allowedUpdates.parentId = taskData.parentId;
  if (taskData.kanbanStatus !== undefined) allowedUpdates.kanbanStatus = taskData.kanbanStatus;

  // Automatically determine assignedAt and completedAt
  if (taskData.assigneeId !== undefined && taskData.assigneeId !== taskObj.assigneeId) {
    allowedUpdates.assignedAt = taskData.assigneeId ? new Date().toISOString() : null;
  }
  if (taskData.status !== undefined && taskData.status !== taskObj.status) {
    if (taskData.status === 'completed') {
      allowedUpdates.completedAt = new Date().toISOString();
    } else {
      allowedUpdates.completedAt = null;
    }
  }

  const db = await getDb();
  if (db) {
    await db.collection('tasks').updateOne({ _id: id }, { $set: allowedUpdates });
    return { ...taskObj, ...allowedUpdates };
  }

  const localDb = readDb();
  localDb.tasks = localDb.tasks || [];
  const idx = localDb.tasks.findIndex(t => t.id === id);
  if (idx !== -1) {
    localDb.tasks[idx] = { ...localDb.tasks[idx], ...allowedUpdates };
    writeDb(localDb);
    return localDb.tasks[idx];
  }
  return null;
}

async function deleteTask(tenantId, id) {
  const taskObj = await getTask(tenantId, id);
  if (!taskObj) {
    throw new Error("Task not found or access denied.");
  }

  const db = await getDb();
  if (db) {
    await db.collection('tasks').deleteOne({ _id: id });
    return true;
  }

  const localDb = readDb();
  localDb.tasks = localDb.tasks || [];
  const filtered = localDb.tasks.filter(t => t.id !== id);
  localDb.tasks = filtered;
  writeDb(localDb);
  return true;
}

async function addTaskComment(tenantId, id, commentData) {
  const taskObj = await getTask(tenantId, id);
  if (!taskObj) {
    throw new Error("Task not found or access denied.");
  }

  const newComment = {
    id: "com_" + Date.now(),
    senderEmail: commentData.senderEmail,
    senderName: commentData.senderName || commentData.senderEmail,
    content: commentData.content || "",
    timestamp: new Date().toISOString()
  };

  const db = await getDb();
  if (db) {
    await db.collection('tasks').updateOne({ _id: id }, { $push: { comments: newComment } });
    return newComment;
  }

  const localDb = readDb();
  localDb.tasks = localDb.tasks || [];
  const idx = localDb.tasks.findIndex(t => t.id === id);
  if (idx !== -1) {
    localDb.tasks[idx].comments = localDb.tasks[idx].comments || [];
    localDb.tasks[idx].comments.push(newComment);
    writeDb(localDb);
    return newComment;
  }
  return null;
}

async function getNotifications(userId) {
  const db = await getDb();
  if (db) {
    const list = await db.collection('notifications')
      .find({ recipientId: userId })
      .sort({ createdAt: -1 })
      .limit(50)
      .toArray();
    return mapIds(list);
  }
  const localDb = readDb();
  localDb.notifications = localDb.notifications || [];
  return localDb.notifications
    .filter(n => n.recipientId === userId)
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
    .slice(0, 50);
}

async function addNotification(userId, notifData) {
  const newNotif = {
    id: "notif_" + Date.now() + "_" + Math.random().toString(36).substr(2, 5),
    recipientId: userId,
    actorName: notifData.actorName || "Teammate",
    taskId: notifData.taskId,
    taskTitle: notifData.taskTitle,
    actionText: notifData.actionText || "updated a task",
    read: false,
    createdAt: new Date().toISOString()
  };

  const db = await getDb();
  if (db) {
    await db.collection('notifications').insertOne(toMongoDoc(newNotif));
    return newNotif;
  }
  const localDb = readDb();
  localDb.notifications = localDb.notifications || [];
  localDb.notifications.push(newNotif);
  writeDb(localDb);
  return newNotif;
}

async function markNotificationRead(userId, notifId) {
  const db = await getDb();
  if (db) {
    await db.collection('notifications').updateOne(
      { id: notifId, recipientId: userId },
      { $set: { read: true } }
    );
    return true;
  }
  const localDb = readDb();
  localDb.notifications = localDb.notifications || [];
  const notif = localDb.notifications.find(n => n.id === notifId && n.recipientId === userId);
  if (notif) {
    notif.read = true;
    writeDb(localDb);
  }
  return true;
}

async function markAllNotificationsRead(userId) {
  const db = await getDb();
  if (db) {
    await db.collection('notifications').updateMany(
      { recipientId: userId },
      { $set: { read: true } }
    );
    return true;
  }
  const localDb = readDb();
  localDb.notifications = localDb.notifications || [];
  localDb.notifications.forEach(n => {
    if (n.recipientId === userId) n.read = true;
  });
  writeDb(localDb);
  return true;
}

async function clearNotifications(userId) {
  const db = await getDb();
  if (db) {
    await db.collection('notifications').deleteMany({ recipientId: userId });
    return true;
  }
  const localDb = readDb();
  localDb.notifications = localDb.notifications || [];
  localDb.notifications = localDb.notifications.filter(n => n.recipientId !== userId);
  writeDb(localDb);
  return true;
}

module.exports = {
  initDatabase,
  getDb,
  getTenantByEmail,
  getTenantById,
  setTenantResetCode,
  resetTenantPassword,
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
  updateHearing,
  getTransactions,
  addTransaction,
  deleteTransaction,
  importTenantBackup,
  getColleagues,
  addColleague,
  getTasks,
  getTask,
  addTask,
  updateTask,
  deleteTask,
  addTaskComment,
  getNotifications,
  addNotification,
  markNotificationRead,
  markAllNotificationsRead,
  clearNotifications
};
