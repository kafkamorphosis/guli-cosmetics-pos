const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { resolveAppUrl, isAllowedUrl, printUrl, boxPrintUrl, readSettings, writeSettings, withTimeout } = require("./lib");

test("resolveAppUrl: --url beats saved beats config, trailing slash removed", () => {
  assert.equal(resolveAppUrl({ argv: ["--url=https://x.vercel.app/"], saved: "https://saved.app", config: { url: "https://cfg.app" } }), "https://x.vercel.app");
  assert.equal(resolveAppUrl({ argv: [], saved: "https://saved.app", config: { url: "https://cfg.app" } }), "https://saved.app");
  assert.equal(resolveAppUrl({ argv: [], saved: null, config: { url: "https://cfg.app" } }), "https://cfg.app");
  assert.equal(resolveAppUrl({ argv: [], saved: null, config: {} }), null);
});

test("resolveAppUrl: only https, or http on localhost", () => {
  assert.equal(resolveAppUrl({ argv: ["--url=http://localhost:3000"], saved: null, config: {} }), "http://localhost:3000");
  assert.equal(resolveAppUrl({ argv: ["--url=http://127.0.0.1:3000/"], saved: null, config: {} }), "http://127.0.0.1:3000");
  assert.equal(resolveAppUrl({ argv: ["--url=http://evil.com"], saved: null, config: {} }), null);
  assert.equal(resolveAppUrl({ argv: ["--url=javascript:alert(1)"], saved: null, config: {} }), null);
  assert.equal(resolveAppUrl({ argv: [], saved: "not a url", config: { url: "https://cfg.app" } }), "https://cfg.app");
});

test("isAllowedUrl: same origin only", () => {
  const app = "https://x.vercel.app";
  assert.equal(isAllowedUrl("https://x.vercel.app/print/1", app), true);
  assert.equal(isAllowedUrl("https://accounts.google.com/", app), false);
  assert.equal(isAllowedUrl("https://x.vercel.app.evil.com/", app), false);
  assert.equal(isAllowedUrl("http://x.vercel.app/", app), false);
  assert.equal(isAllowedUrl("garbage", app), false);
});

test("printUrl accepts only order UUIDs", () => {
  const id = "6f908450-1bb7-4c88-b91f-e4fc7c2d90cc";
  assert.equal(printUrl("https://x.vercel.app", id), `https://x.vercel.app/print/${id}`);
  assert.throws(() => printUrl("https://x.vercel.app", "../admin"));
  assert.throws(() => printUrl("https://x.vercel.app", ""));
});

test("boxPrintUrl accepts only box UUIDs", () => {
  const id = "6f908450-1bb7-4c88-b91f-e4fc7c2d90cc";
  assert.equal(boxPrintUrl("https://x.vercel.app", id), `https://x.vercel.app/print/box/${id}`);
  assert.throws(() => boxPrintUrl("https://x.vercel.app", "../admin"));
});

test("settings round-trip and tolerate a missing or corrupt file", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ub-"));
  const file = path.join(dir, "settings.json");
  assert.deepEqual(readSettings(file), {});
  writeSettings(file, { url: "https://x.vercel.app" });
  writeSettings(file, { printer: "HP LaserJet" });
  assert.deepEqual(readSettings(file), { url: "https://x.vercel.app", printer: "HP LaserJet" });
  fs.writeFileSync(file, "{not json");
  assert.deepEqual(readSettings(file), {});
});

test("withTimeout rejects with the reason when the promise never settles", async () => {
  await assert.rejects(withTimeout(new Promise(() => {}), 20, "PRINT_TIMEOUT"), /PRINT_TIMEOUT/);
  assert.equal(await withTimeout(Promise.resolve(5), 1000, "x"), 5);
});

test("isSafeExternalUrl: only web, mail and phone links may leave the app", () => {
  const { isSafeExternalUrl } = require("./lib");
  assert.equal(isSafeExternalUrl("https://supabase.com/docs"), true);
  assert.equal(isSafeExternalUrl("http://example.com"), true);
  assert.equal(isSafeExternalUrl("mailto:a@b.uz"), true);
  assert.equal(isSafeExternalUrl("tel:+821012345678"), true);
  assert.equal(isSafeExternalUrl("file:///C:/Windows/System32/calc.exe"), false);
  assert.equal(isSafeExternalUrl("smb://evil/share"), false);
  assert.equal(isSafeExternalUrl("ms-settings:"), false);
  assert.equal(isSafeExternalUrl("not a url"), false);
});
