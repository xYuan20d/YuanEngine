// preload/index.ts
import { contextBridge, ipcRenderer } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'

// 自定义 API
const api = {
  // 暴露 readFile 方法
  readFile: (path: string) => ipcRenderer.invoke('read-file', path),
  saveProject: (path: string, data: string) => ipcRenderer.invoke('save-project-file', { path, data }),
  saveProjectAs: (data: string) => ipcRenderer.invoke('save-project-as', data),
  loadProject: (path: string) => ipcRenderer.invoke('load-project-file', path),
  
  // 路径工具
  pathJoin: (...args: string[]) => ipcRenderer.invoke('path-join', ...args),

  // 事件监听 (菜单栏触发)
  onProjectOpened: (callback: (path: string) => void) => 
    ipcRenderer.on('project-opened', (_e, path) => callback(path)),
  
  onRequestSave: (callback: () => void) => 
    ipcRenderer.on('request-save', () => callback())
}

if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('electron', electronAPI)
    // 🟢 挂载我们的 fileSystem API
    contextBridge.exposeInMainWorld('fileSystem', api)
  } catch (error) {
    console.error(error)
  }
} else {
  // @ts-ignore (fallback)
  window.electron = electronAPI
  // @ts-ignore
  window.fileSystem = api
}