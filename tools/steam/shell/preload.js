'use strict';
// The only door between the page and the desktop shell. The page gets a few plain functions (no Node, no ipcRenderer).
const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('keepfallSteam', {
  shell: 'electron',
  status: () => ipcRenderer.invoke('steam:status'),
  unlock: (id) => ipcRenderer.invoke('steam:unlock', id),
  cloudRead: (name) => ipcRenderer.invoke('steam:cloud-read', name),
  cloudWrite: (name, text) => ipcRenderer.invoke('steam:cloud-write', name, text),
  presence: (key, value) => ipcRenderer.invoke('steam:presence', key, value),
  blockedRequests: () => ipcRenderer.invoke('shell:blocked'),
});
