const db = require('./src/utils/db');

async function check() {
  const cols = await db.query("SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'verification_requests'");
  console.log("COLUMNS:", JSON.stringify(cols.rows, null, 2));

  const fks = await db.query("SELECT kcu.column_name, ccu.table_name AS references_table FROM information_schema.table_constraints tc JOIN information_schema.key_column_usage kcu ON tc.constraint_name = kcu.constraint_name JOIN information_schema.constraint_column_usage ccu ON tc.constraint_name = ccu.constraint_name WHERE tc.table_name = 'verification_requests' AND tc.constraint_type = 'FOREIGN KEY'");
  console.log("FOREIGN KEYS:", JSON.stringify(fks.rows, null, 2));
}

check().catch(console.error).finally(() => process.exit());
