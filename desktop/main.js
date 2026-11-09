// Guli cosmetics — Windows shell around the web app, adding silent A4 printing.
const { app, BrowserWindow, ipcMain, Menu, shell } = require("electron");
const path = require("node:path");
const { normalizeUrl, resolveAppUrl, isAllowedUrl, isSafeExternalUrl, printUrl, boxPrintUrl, readSettings, writeSettings, withTimeout } = require("./lib");
const config = require("./config.json");

const DEV = process.argv.includes("--dev");
const ICON = path.join(__dirname, "build", "icon.png");
const settingsFile = () => path.join(app.getPath("userData"), "settings.json");

let appUrl = null;
let mainWin = null;
let settingsWin = null;

// --user-data=<dir> gives a test run its own settings (and its own single-instance lock).
const userDataArg = process.argv.find((a) => a.startsWith("--user-data="));
if (userDataArg) app.setPath("userData", userDataArg.slice("--user-data=".length));

// A second launch exits at once; the running instance focuses itself (see "second-instance").
if (!app.requestSingleInstanceLock()) app.exit(0);
app.setAppUserModelId("uz.gulicosmetics.pos");

function currentUrl() {
  return resolveAppUrl({ argv: process.argv, saved: readSettings(settingsFile()).url ?? null, config });
}

function openOutside(url) {
  if (isSafeExternalUrl(url)) shell.openExternal(url);
}

function loadApp() {
  appUrl = currentUrl();
  if (appUrl) mainWin.loadURL(appUrl);
  else openSettings();
}

// First run has no address yet: show only Settings. Saving starts the app; closing quits.
function start() {
  appUrl = currentUrl();
  if (appUrl) createMain();
  else openSettings();
}

function createMain() {
  mainWin = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 1024,
    minHeight: 700,
    show: false,
    title: "Guli cosmetics",
    icon: ICON,
    backgroundColor: "#f2f2f0",
    autoHideMenuBar: true,
    webPreferences: { preload: path.join(__dirname, "preload.js"), contextIsolation: true, nodeIntegration: false, sandbox: true },
  });
  mainWin.once("ready-to-show", () => {
    mainWin.maximize();
    mainWin.show();
  });

  // Anything outside the app (Supabase links, help pages…) opens in the normal browser and never
  // runs inside this window, so it can never reach the print bridge.
  mainWin.webContents.setWindowOpenHandler(({ url }) => {
    if (appUrl && isAllowedUrl(url, appUrl)) return { action: "allow" };
    openOutside(url);
    return { action: "deny" };
  });
  const keepInside = (event, url) => {
    if (url.startsWith("file:")) return;
    if (!appUrl || !isAllowedUrl(url, appUrl)) {
      event.preventDefault();
      openOutside(url);
    }
  };
  mainWin.webContents.on("will-navigate", keepInside);
  // Server-side redirects don't go through will-navigate.
  mainWin.webContents.on("will-redirect", keepInside);
  mainWin.webContents.on("did-fail-load", (_e, code, _desc, _url, isMainFrame) => {
    // -3 is an aborted navigation (normal during redirects).
    if (isMainFrame && code !== -3) mainWin.loadFile(path.join(__dirname, "offline.html"));
  });
  mainWin.on("closed", () => (mainWin = null));
  loadApp();
}

function openSettings() {
  if (settingsWin) return settingsWin.focus();
  settingsWin = new BrowserWindow({
    width: 560,
    height: 640,
    parent: mainWin ?? undefined,
    modal: Boolean(mainWin),
    title: "Sozlamalar — Guli cosmetics",
    icon: ICON,
    backgroundColor: "#f2f2f0",
    autoHideMenuBar: true,
    webPreferences: { preload: path.join(__dirname, "shell-preload.js"), contextIsolation: true, nodeIntegration: false, sandbox: true },
  });
  settingsWin.loadFile(path.join(__dirname, "settings.html"));
  settingsWin.on("closed", () => {
    settingsWin = null;
    if (!mainWin) app.quit();
  });
}

// Loads a page in a hidden window (same session, so the user is signed in), waits for every image,
// checks it really is an order sheet when required, then prints it silently.
async function printPage(url, deviceName, { requireSheet }) {
  const win = new BrowserWindow({ show: false, webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true } });
  try {
    await withTimeout(
      new Promise((resolve, reject) => {
        win.webContents.once("did-finish-load", resolve);
        win.webContents.once("did-fail-load", (_e, code, desc) => {
          if (code !== -3) reject(new Error(`LOAD_FAILED: ${desc}`));
        });
        win.loadURL(url);
      }),
      30_000,
      "PRINT_TIMEOUT",
    );
    const ready = await withTimeout(
      win.webContents.executeJavaScript(
        `(async () => {
          await Promise.all([...document.images].map((i) => (i.complete ? null : i.decode().catch(() => null))));
          return ${requireSheet ? "Boolean(document.querySelector('.sheet'))" : "true"};
        })()`,
      ),
      15_000,
      "PRINT_TIMEOUT",
    );
    if (!ready) throw new Error("SHEET_NOT_FOUND");
    await withTimeout(
      new Promise((resolve, reject) =>
        win.webContents.print(
          { silent: true, printBackground: true, deviceName: deviceName || "", pageSize: "A4", margins: { marginType: "default" } },
          (success, reason) => (success ? resolve() : reject(new Error(`PRINT_FAILED: ${reason}`))),
        ),
      ),
      60_000,
      "PRINT_TIMEOUT",
    );
  } finally {
    win.destroy();
  }
}

// --- IPC ---------------------------------------------------------------------------------------

ipcMain.on("app-origin", (event) => {
  event.returnValue = appUrl ? new URL(appUrl).origin : null;
});

ipcMain.handle("print-order", async (event, orderId) => {
  if (!appUrl || !isAllowedUrl(event.senderFrame.url, appUrl)) throw new Error("FORBIDDEN");
  await printPage(printUrl(appUrl, orderId), readSettings(settingsFile()).printer, { requireSheet: true });
});

// Seller box lists (Tekpe → Qutilar) print the same way.
ipcMain.handle("print-box", async (event, boxId) => {
  if (!appUrl || !isAllowedUrl(event.senderFrame.url, appUrl)) throw new Error("FORBIDDEN");
  await printPage(boxPrintUrl(appUrl, boxId), readSettings(settingsFile()).printer, { requireSheet: true });
});

const fromLocalPage = (event) => event.senderFrame.url.startsWith("file:");

ipcMain.handle("settings:get", async (event) => {
  if (!fromLocalPage(event)) throw new Error("FORBIDDEN");
  const saved = readSettings(settingsFile());
  const printers = await event.sender.getPrintersAsync();
  return {
    url: saved.url ?? config.url ?? "",
    printer: saved.printer ?? "",
    printers: printers.map((p) => ({ name: p.name, displayName: p.displayName || p.name, isDefault: Boolean(p.isDefault) })),
  };
});

ipcMain.handle("settings:save", (event, input) => {
  if (!fromLocalPage(event)) throw new Error("FORBIDDEN");
  const url = normalizeUrl(input && input.url);
  if (!url) throw new Error("INVALID_URL");
  writeSettings(settingsFile(), { url, printer: (input && input.printer) || "" });
  if (mainWin) loadApp();
  else start();
  if (settingsWin) settingsWin.close();
});

ipcMain.handle("settings:test-print", async (event, printer) => {
  if (!fromLocalPage(event)) throw new Error("FORBIDDEN");
  const html = encodeURIComponent(
    `<!doctype html><meta charset="utf-8"><body style="font:16px sans-serif;padding:20mm">
     <h1 style="font-size:22px">Guli cosmetics — sinov sahifasi</h1>
     <p>Agar bu sahifa dialogsiz chiqqan boʻlsa, printer toʻgʻri sozlangan.</p>
     <p>${new Date().toLocaleString("uz-UZ")}</p></body>`,
  );
  await printPage(`data:text/html;charset=utf-8,${html}`, printer, { requireSheet: false });
});

ipcMain.handle("shell:retry", (event) => {
  if (!fromLocalPage(event)) throw new Error("FORBIDDEN");
  if (mainWin) loadApp();
});

ipcMain.handle("shell:open-settings", (event) => {
  if (!fromLocalPage(event)) throw new Error("FORBIDDEN");
  openSettings();
});

// --- App lifecycle -----------------------------------------------------------------------------

app.on("second-instance", () => {
  if (!mainWin) return openSettings();
  if (mainWin.isMinimized()) mainWin.restore();
  mainWin.focus();
});

app.whenReady().then(() => {
  Menu.setApplicationMenu(
    Menu.buildFromTemplate([
      {
        label: "Ilova",
        submenu: [
          { label: "Printer va manzil sozlamalari", accelerator: "CmdOrCtrl+,", click: openSettings },
          { label: "Qayta yuklash", accelerator: "F5", click: () => mainWin && mainWin.webContents.reload() },
          { label: "Toʻliq ekran", role: "togglefullscreen" },
          ...(DEV ? [{ role: "toggleDevTools" }] : []),
          { type: "separator" },
          { label: "Chiqish", role: "quit" },
        ],
      },
    ]),
  );
  start();
});

app.on("window-all-closed", () => app.quit());
