import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('electronAPI', {
  versions: process.versions,

  /** Fires when electron-updater detects a new version is available for download. */
  onUpdateAvailable: (cb: () => void) => {
    ipcRenderer.on('update-available', () => cb());
  },

  /** Fires when the update has been fully downloaded and is ready to install. */
  onUpdateDownloaded: (cb: () => void) => {
    ipcRenderer.on('update-downloaded', () => cb());
  },

  /** Quits the app and installs the downloaded update. */
  installUpdateAndRestart: () => {
    ipcRenderer.invoke('quit-and-install');
  },
});
