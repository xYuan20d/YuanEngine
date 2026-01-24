// src/preload/index.d.ts (或你存放类型的地方)

export interface IFileSystemAPI {
  // 1. 基础读写
  readFile: (path: string) => Promise<{ success: boolean, content: string, error?: string }>
  saveProjectAs: (data: string) => Promise<{ success: boolean, path?: string, error?: string, canceled?: boolean }>
  // 2. 项目管理 (新增)
  saveProject: (path: string, data: string) => Promise<{ success: boolean, error?: string }>
  loadProject: (path: string) => Promise<{ success: boolean, data?: string, error?: string }>
  
  // 3. 路径工具 (新增)
  pathJoin: (...args: string[]) => Promise<string>

  // 4. 事件监听 (新增)
  onProjectOpened: (callback: (path: string) => void) => void
  onRequestSave: (callback: () => void) => void
}

declare global {
  interface Window {
    // 扩展 window 对象
    fileSystem: IFileSystemAPI
    
    // 引擎全局类 (我们也顺便在这里声明一下，这样你在 .vue 文件里用也不会飘红)
    Behaviour: any 
    PropType: any
    THREE: any
  }
}