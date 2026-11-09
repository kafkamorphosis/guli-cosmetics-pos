// Pure helpers for the desktop shell (tested with `node --test`).
const fs = require("node:fs");
const path = require("node:path");

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Only https, or plain http to this machine (development). Returns the origin-ish URL without a trailing slash.
function normalizeUrl(raw) {
  if (typeof raw !== "string" || !raw.trim()) return null;
  let u;
  try {
    u = new URL(raw.trim());
  } catch {
    return null;
  }
  const local = u.hostname === "localhost" || u.hostname === "127.0.0.1";
  if (u.protocol !== "https:" && !(u.protocol === "http:" && local)) return null;
  return `${u.protocol}//${u.host}${u.pathname.replace(/\/+$/, "")}`;
}

// Precedence: --url=<u> on the command line, then the URL saved in settings, then config.json.
function resolveAppUrl({ argv, saved, config }) {
  const flag = (argv || []).find((a) => a.startsWith("--url="));
  for (const candidate of [flag && flag.slice("--url=".length), saved, config && config.url]) {
    const url = normalizeUrl(candidate);
    if (url) return url;
  }
  return null;
}

function isAllowedUrl(target, appUrl) {
  try {
    return new URL(target).origin === new URL(appUrl).origin;
  } catch {
    return false;
  }
}

// shell.openExternal hands URLs to Windows; file:, smb: or custom schemes could launch programs.
const SAFE_EXTERNAL = new Set(["https:", "http:", "mailto:", "tel:"]);
function isSafeExternalUrl(target) {
  try {
    return SAFE_EXTERNAL.has(new URL(target).protocol);
  } catch {
    return false;
  }
}

function printUrl(appUrl, orderId) {
  if (!UUID_RE.test(String(orderId))) throw new Error("INVALID_ORDER_ID");
  return `${appUrl}/print/${encodeURIComponent(orderId)}`;
}

function boxPrintUrl(appUrl, boxId) {
  if (!UUID_RE.test(String(boxId))) throw new Error("INVALID_BOX_ID");
  return `${appUrl}/print/box/${encodeURIComponent(boxId)}`;
}

function readSettings(file) {
  try {
    const data = JSON.parse(fs.readFileSync(file, "utf8"));
    return data && typeof data === "object" && !Array.isArray(data) ? data : {};
  } catch {
    return {};
  }
}

function writeSettings(file, patch) {
  const next = { ...readSettings(file), ...patch };
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(next, null, 2));
  return next;
}

function withTimeout(promise, ms, reason) {
  let timer;
  return Promise.race([
    promise,
    new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error(reason)), ms);
    }),
  ]).finally(() => clearTimeout(timer));
}

module.exports = { normalizeUrl, resolveAppUrl, isAllowedUrl, isSafeExternalUrl, printUrl, boxPrintUrl, readSettings, writeSettings, withTimeout };
