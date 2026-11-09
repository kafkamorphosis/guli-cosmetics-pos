// Creates an admin account. Run it yourself: node scripts/create-admin.mjs
// Needs NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SECRET_KEY in .env.local.
import readline from "node:readline";
import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";

config({ path: ".env.local", quiet: true });
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SECRET_KEY;
if (!url || !key) {
  console.error("NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SECRET_KEY must be set in .env.local");
  process.exit(1);
}

const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });
const ask = (q) => new Promise((resolve) => rl.question(q, resolve));
const askHidden = (q) =>
  new Promise((resolve) => {
    const write = rl._writeToOutput;
    rl._writeToOutput = (s) => (s.includes(q) ? write.call(rl, s) : write.call(rl, "*"));
    rl.question(q, (answer) => {
      rl._writeToOutput = write;
      process.stdout.write("\n");
      resolve(answer);
    });
  });

const username = (await ask("Login (3-32: a-z 0-9 . _ -): ")).trim().toLowerCase();
const fullName = (await ask("Ism familiya: ")).trim();
const password = await askHidden("Parol (kamida 8 belgi): ");
rl.close();

if (!/^[a-z0-9._-]{3,32}$/.test(username)) {
  console.error("Login notoʻgʻri.");
  process.exit(1);
}
if (password.length < 8) {
  console.error("Parol juda qisqa.");
  process.exit(1);
}

const sb = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
const { error } = await sb.auth.admin.createUser({
  email: `${username}@gulicosmetics.local`,
  password,
  email_confirm: true,
  user_metadata: { username, full_name: fullName },
  app_metadata: { role: "admin" },
});
if (error) {
  console.error("Xatolik:", error.message);
  process.exit(1);
}
console.log(`Admin akkaunt yaratildi: ${username}`);
