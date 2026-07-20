const db = require('./server-db.js');

async function audit() {
  console.log("Auditing getPublicClientPortalData across all tenants and clients...");
  const localDb = db.readDb ? db.readDb() : require('./database.json');
  
  const clients = localDb.clients || [];
  const cases = localDb.cases || [];

  console.log(`Found ${clients.length} clients and ${cases.length} cases in local database.`);

  for (const c of clients) {
    const data = await db.getPublicClientPortalData(c.id);
    const caseCount = data && data.cases ? data.cases.length : 0;
    console.log(`Client [${c.name}] (ID: ${c.id}) -> Portal returned ${caseCount} cases.`);
  }

  process.exit(0);
}

audit();
