import { contextBridge, ipcRenderer } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'

// 自定义 API
const api = {
  // 原有的
  readFile: (path: string) => ipcRenderer.invoke('read-file', path),
  readBuffer: (path: string) => ipcRenderer.invoke('read-buffer', path),
  saveProject: (path: string, data: string) => ipcRenderer.invoke('save-project-file', { path, data }),
  saveProjectAs: (data: string) => ipcRenderer.invoke('save-project-as', data),
  loadProject: (path: string) => ipcRenderer.invoke('load-project-file', path),
  pathJoin: (...args: string[]) => ipcRenderer.invoke('path-join', ...args),
  
  // 🟢 [新增] 暴露新的 IPC 给前端
  writeFile: (path: string, data: string) => ipcRenderer.invoke('write-file', { path, data }),
  readDir: (path: string) => ipcRenderer.invoke('read-dir', path),

  deletePath: (path: string) => ipcRenderer.invoke('delete-path', path),
  renamePath: (oldPath: string, newPath: string) => ipcRenderer.invoke('rename-path', { oldPath, newPath }),
  createDir: (path: string) => ipcRenderer.invoke('create-dir', path),
  copyFile: (src: string, dest: string) => ipcRenderer.invoke('copy-file', { src, dest }),
  exists: (path: string) => ipcRenderer.invoke('path-exists', path),

  // 事件监听
  onProjectOpened: (callback: (path: string) => void) => 
    ipcRenderer.on('project-opened', (_e, path) => callback(path)),
  onRequestSave: (callback: () => void) => 
    ipcRenderer.on('request-save', () => callback())
}

if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('electron', electronAPI)
    contextBridge.exposeInMainWorld('fileSystem', api)
  } catch (error) {
    console.error(error)
  }
} else {
  // @ts-ignore
  window.electron = electronAPI
  // @ts-ignore
  window.fileSystem = api
}