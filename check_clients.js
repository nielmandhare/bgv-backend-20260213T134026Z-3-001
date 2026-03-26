const db = require('./src/utils/db');

async function check() {
  const exists = await db.query("SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'clients')");
  console.log("clients table exists:", exists.rows[0].exists);

  if (exists.rows[0].exists) {
    const rows = await db.query("SELECT * FROM clients LIMIT 5");
    console.log("clients rows:", JSON.stringify(rows.rows, null, 2));
  }
}

check().catch(console.error).finally(() => process.exit());
