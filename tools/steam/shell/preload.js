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
  // Friend-hosted multiplayer (mp.js): the room's maker is the server, friends come over LAN / direct IP or Steam.
  mp: {
    info: () => ipcRenderer.invoke('mp:info'),
    hostOpen: (options) => ipcRenderer.invoke('mp:host-open', options),
    hostUpdate: (data) => ipcRenderer.invoke('mp:host-update', data),
    leave: () => ipcRenderer.invoke('mp:leave'),
    joinLan: (address) => ipcRenderer.invoke('mp:join-lan', address),
    joinSteam: (lobbyId) => ipcRenderer.invoke('mp:join-steam', lobbyId),
    lobbies: () => ipcRenderer.invoke('mp:lobbies'),
    invite: () => ipcRenderer.invoke('mp:invite'),
    probe: () => ipcRenderer.invoke('mp:probe'),
    onEvent: (handler) => { ipcRenderer.on('mp:event', (_e, event) => { try { handler(event); } catch { /* the page's business */ } }); },
  },
});
