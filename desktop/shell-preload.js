// Preload for the app's own local pages (settings, offline). Never loaded for web content.
const { contextBridge, ipcRenderer } = require("electron");

if (location.protocol === "file:") {
  contextBridge.exposeInMainWorld("guliShell", {
    getSettings: () => ipcRenderer.invoke("settings:get"),
    save: (input) => ipcRenderer.invoke("settings:save", input),
    testPrint: (printer) => ipcRenderer.invoke("settings:test-print", printer),
    retry: () => ipcRenderer.invoke("shell:retry"),
    openSettings: () => ipcRenderer.invoke("shell:open-settings"),
  });
}
