// src/engine/FileSystem.ts

// 1. 定义通用结果类型
export interface FileResult<T = string> {
  success: boolean
  data?: T
  error?: string
}

export interface FileEntry {
  name: string
  isDirectory: boolean
  path: string
}

// 2. 定义适配器接口 (Standard Interface)
interface IFileSystemAdapter {
  // 基础 IO
  readFile(path: string): Promise<FileResult<string>>       // 读文本 (JSON, JS)
  readBuffer(path: string): Promise<FileResult<ArrayBuffer>> // 🟢 新增：读二进制 (GLB, PNG)
  writeFile(path: string, content: string): Promise<FileResult<void>>
  readDir(path: string): Promise<FileResult<FileEntry[]>>
  exists(path: string): Promise<boolean>
  pathJoin(...paths: string[]): Promise<string>
  
  // 🟢 新增：文件操作 API
  delete(path: string): Promise<FileResult<void>>
  rename(oldPath: string, newPath: string): Promise<FileResult<void>>
  mkdir(path: string): Promise<FileResult<void>>
  copy(src: string, dest: string): Promise<FileResult<void>>

  // 当前系统
  getEnv(): string

  // 项目管理特有 API
  saveProject(path: string, data: string): Promise<FileResult<void>>
  saveProjectAs(data: string): Promise<FileResult<{ path: string }>>

  onProjectOpened(callback: (path: string) => void): void
  onRequestSave(callback: () => void): void
}

// 3. Electron 适配器实现
class ElectronAdapter implements IFileSystemAdapter {
  // 懒获取 API
  private get api() {
    return (window as any).fileSystem
  }

  private checkApi() {
    if (!this.api) return { success: false, error: 'No Electron API' }
    return null
  }

  async readFile(path: string) {
    const err = this.checkApi(); if (err) return err
    const res = await this.api.readFile(path)
    return { success: res.success, data: res.content, error: res.error }
  }

  async readBuffer(path: string) {
    const err = this.checkApi(); if (err) return err
    // 假设后端 IPC 返回的是 Uint8Array 或 Buffer
    const res = await this.api.readBuffer(path) 
    return { success: res.success, data: res.data, error: res.error }
  }

  async writeFile(path: string, content: string) {
    const err = this.checkApi(); if (err) return err
    const res = await this.api.writeFile(path, content)
    return { success: res.success, error: res.error }
  }

  async readDir(path: string) {
    const err = this.checkApi(); if (err) return err
    const res = await this.api.readDir(path)
    if (res.success) {
      return { success: true, data: res.files }
    }
    return { success: false, error: res.error }
  }

  async exists(path: string) {
    if (!this.api) return false
    // 🟢 调用专用的 IPC，而不是读取文件
    return await this.api.exists(path)
  }

  async pathJoin(...paths: string[]) {
    if (!this.api) return paths.join('/')
    return await this.api.pathJoin(...paths)
  }

  // 🟢 新增 API 实现
  
  async delete(path: string) {
    const err = this.checkApi(); if (err) return err
    const res = await this.api.deletePath(path)
    return { success: res.success, error: res.error }
  }

  async rename(oldPath: string, newPath: string) {
    const err = this.checkApi(); if (err) return err
    const res = await this.api.renamePath(oldPath, newPath)
    return { success: res.success, error: res.error }
  }

  async mkdir(path: string) {
    const err = this.checkApi(); if (err) return err
    const res = await this.api.createDir(path)
    return { success: res.success, error: res.error }
  }

  async copy(src: string, dest: string) {
    const err = this.checkApi(); if (err) return err
    const res = await this.api.copyFile(src, dest)
    return { success: res.success, error: res.error }
  }

  // --- 项目特有 ---
  
  async saveProject(path: string, data: string) {
    const err = this.checkApi(); if (err) return err
    const res = await this.api.saveProject(path, data)
    return { success: res.success, error: res.error }
  }

  async saveProjectAs(data: string) {
    const err = this.checkApi(); if (err) return err
    const res = await this.api.saveProjectAs(data)
    return { success: res.success, data: res.path ? { path: res.path } : undefined, error: res.error }
  }

  onProjectOpened(callback: (path: string) => void) {
    if (this.api?.onProjectOpened) {
      this.api.onProjectOpened(callback)
    }
  }

  onRequestSave(callback: () => void) {
    if (this.api?.onRequestSave) {
      this.api.onRequestSave(callback)
    }
  }

  getEnv(): string {
    return "Electron"
  }
}

// 4. Web 适配器实现 (Mock)
class WebAdapter implements IFileSystemAdapter {
  async readFile(path: string) {
    console.warn('[WebFS] Mock read:', path)
    return { success: false, error: 'WebFS not implemented' }
  }
  async readBuffer() { return { success: false, error: 'WebFS' } }
  async writeFile() { return { success: false, error: 'WebFS not implemented' } }
  async readDir() { return { success: false, error: 'WebFS not implemented' } }
  async exists() { return false }
  async pathJoin(...paths: string[]) { return paths.join('/') }
  
  // Mock operations
  async delete() { return { success: false } }
  async rename() { return { success: false } }
  async mkdir() { return { success: false } }
  async copy() { return { success: false } }

  async saveProject() { return { success: false } }
  async saveProjectAs() { return { success: false } }

  onProjectOpened(_callback: (path: string) => void) {
    console.warn('[WebFS] onProjectOpened: 浏览器环境需通过网页 UI 触发')
  }

  onRequestSave(_callback: () => void) {
    console.warn('[WebFS] onRequestSave: 浏览器环境需通过网页 UI 触发')
  }

  getEnv(): string {
    return "Web"
  }
}

// 5. 工厂模式
const getAdapter = (): IFileSystemAdapter => {
  if ((window as any).fileSystem) {
    return new ElectronAdapter()
  }
  return new WebAdapter()
}

// 导出单例
export const FileSystem = getAdapter()