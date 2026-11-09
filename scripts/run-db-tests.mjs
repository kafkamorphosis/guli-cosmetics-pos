// Runs each supabase/tests/NN_*.sql inside a rolled-back transaction, with _helpers.sql prepended.
// Needs SUPABASE_DB_URL in .env.local (Dashboard -> Connect -> Session pooler URI).
// DB_TEST_PRELUDE=path1.sql,path2.sql runs migrations that are not live yet inside each transaction.
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import pg from "pg";
import { config } from "dotenv";

config({ path: ".env.local", quiet: true });
const url = process.env.SUPABASE_DB_URL;
if (!url) {
  console.error("SUPABASE_DB_URL is not set in .env.local");
  process.exit(1);
}

const dir = "supabase/tests";
const helpers = readFileSync(join(dir, "_helpers.sql"), "utf8");
const only = process.argv[2];
const prelude = (process.env.DB_TEST_PRELUDE ?? "")
  .split(",")
  .filter(Boolean)
  .map((f) => readFileSync(f.trim(), "utf8"));
const files = readdirSync(dir).filter((f) => /^\d+_.*\.sql$/.test(f) && (!only || f.includes(only))).sort();

let failed = 0;
for (const file of files) {
  const client = new pg.Client({ connectionString: url });
  await client.connect();
  try {
    await client.query("begin");
    for (const sql of prelude) await client.query(sql);
    await client.query(helpers);
    await client.query(readFileSync(join(dir, file), "utf8"));
    console.log(`PASS ${file}`);
  } catch (e) {
    failed++;
    console.log(`FAIL ${file}: ${e.message}`);
  } finally {
    await client.query("rollback").catch(() => {});
    await client.end();
  }
}
// Sequences ignore rollback: put order numbering back where the real orders left it.
const reset = new pg.Client({ connectionString: url });
await reset.connect();
await reset.query("select setval('public.order_no_seq', coalesce((select max(order_no) from public.orders), 0) + 1, false)");
await reset.end();
console.log(`${files.length - failed}/${files.length} passed`);
process.exit(failed ? 1 : 0);
