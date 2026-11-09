// Main window preload. On the web app (and only its own origin) it exposes the print bridge;
// on the app's local offline page it exposes "retry" and "settings".
const { contextBridge, ipcRenderer } = require("electron");

if (location.protocol === "file:") {
  contextBridge.exposeInMainWorld("guliShell", {
    retry: () => ipcRenderer.invoke("shell:retry"),
    openSettings: () => ipcRenderer.invoke("shell:open-settings"),
  });
} else {
  const appOrigin = ipcRenderer.sendSync("app-origin");
  if (appOrigin && location.origin === appOrigin) {
    contextBridge.exposeInMainWorld("guliDesktop", {
      print: (orderId) => ipcRenderer.invoke("print-order", String(orderId)),
      printBox: (boxId) => ipcRenderer.invoke("print-box", String(boxId)),
    });
  }
}
