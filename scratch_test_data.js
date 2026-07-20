const db = require('./server-db.js');

async function test() {
  const data = await db.getPublicClientPortalData('c_1_t_1784283098735');
  console.log("PORTAL DATA RETURNED:", JSON.stringify(data, null, 2));
  process.exit(0);
}

test();
