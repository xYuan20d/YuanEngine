import { ElectronAPI } from '@electron-toolkit/preload'

// 1. 定义文件条目结构 (给 readDir 用)
export interface FileEntry {
  name: string
  isDirectory: boolean
  path: string
}

export interface IFileSystemAPI {
  // --- 基础读写 (IO) ---
  
  // 读取文件
  readFile: (path: string) => Promise<{ success: boolean, content: string, error?: string }>
  readBuffer: (path: string) => Promise<{ success: boolean, data?: Uint8Array, error?: string }>
  
  // 🟢 [新增] 写入文件 (通用)
  writeFile: (path: string, data: string) => Promise<{ success: boolean, error?: string }>
  
  // 🟢 [新增] 读取目录结构
  readDir: (path: string) => Promise<{ success: boolean, files?: FileEntry[], error?: string }>

  // --- 项目管理 (Project) ---
  
  // 另存为项目 (弹出对话框)
  saveProjectAs: (data: string) => Promise<{ success: boolean, path?: string, error?: string, canceled?: boolean }>
  
  // 保存项目 (内部专用，覆盖 project.json)
  saveProject: (path: string, data: string) => Promise<{ success: boolean, error?: string }>
  
  // 加载项目
  loadProject: (path: string) => Promise<{ success: boolean, data?: string, error?: string }>
  
  // --- 工具 (Utils) ---
  
  // 路径拼接 (解决跨平台斜杠问题)
  pathJoin: (...args: string[]) => Promise<string>

  deletePath: (path: string) => Promise<{ success: boolean, error?: string }>
  renamePath: (oldPath: string, newPath: string) => Promise<{ success: boolean, error?: string }>
  createDir: (path: string) => Promise<{ success: boolean, error?: string }>
  copyFile: (src: string, dest: string) => Promise<{ success: boolean, error?: string }>
  exists: (path: string) => Promise<boolean>

  // --- 事件监听 (Events) ---
  
  onProjectOpened: (callback: (path: string) => void) => void
  onRequestSave: (callback: () => void) => void
}

declare global {
  interface Window {
    electron: ElectronAPI
    fileSystem: IFileSystemAPI
    
    // --- 引擎全局变量 (ScriptRunner 注入的) ---
    // 声明这些是为了在 .vue 文件或普通 .ts 文件中引用时不报错
    Behaviour: any 
    PropType: any
    THREE: any
    RAPIER: any
    Input: any
    Time: any
    Global: any
    Wait: any
  }
}