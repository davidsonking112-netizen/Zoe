"use strict";

const { contextBridge, ipcRenderer } = require("electron");

const invoke = (channel, ...args) => ipcRenderer.invoke(channel, ...args);
contextBridge.exposeInMainWorld("zoe", Object.freeze({
  getState: () => invoke("zoe:state"),
  newTab: url => invoke("zoe:new-tab", url),
  closeTab: id => invoke("zoe:close-tab", id),
  selectTab: id => invoke("zoe:select-tab", id),
  navigate: url => invoke("zoe:navigate", url),
  back: () => invoke("zoe:back"),
  forward: () => invoke("zoe:forward"),
  reload: () => invoke("zoe:reload"),
  toggleAI: () => invoke("zoe:toggle-ai"),
  inspect: () => invoke("zoe:inspect"),
  action: action => invoke("zoe:action", action),
  askAI: text => invoke("zoe:ask-ai", text),
  configureAI: config => invoke("zoe:ai-config", config),
  onState: callback => { const listener=(_event,state)=>callback(state); ipcRenderer.on("zoe:state",listener); return ()=>ipcRenderer.removeListener("zoe:state",listener); },
  onError: callback => { const listener=(_event,message)=>callback(message); ipcRenderer.on("zoe:error",listener); return ()=>ipcRenderer.removeListener("zoe:error",listener); },
  onNotice: callback => { const listener=(_event,message)=>callback(message); ipcRenderer.on("zoe:notice",listener); return ()=>ipcRenderer.removeListener("zoe:notice",listener); },
  onDownloadProgress: callback => { const listener=(_event,progress)=>callback(progress); ipcRenderer.on("zoe:download-progress",listener); return ()=>ipcRenderer.removeListener("zoe:download-progress",listener); }
}));
