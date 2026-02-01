import { app, shell, BrowserWindow, ipcMain, Menu, dialog } from 'electron'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import icon from '../../resources/icon.png?asset'
import { readFile, writeFile, mkdir, readdir, stat, rm, rename, copyFile, access } from 'fs/promises'
import { existsSync } from 'fs'

function createMenu(mainWindow: BrowserWindow) {
  const template = [
    {
      label: 'File',
      submenu: [
        {
          label: 'Open Project...',
          accelerator: 'CmdOrCtrl+O',
          click: async () => {
            const result = await dialog.showOpenDialog(mainWindow, {
              properties: ['openDirectory']
            })
            if (!result.canceled && result.filePaths.length > 0) {
              const projectPath = result.filePaths[0]
              mainWindow.webContents.send('project-opened', projectPath)
            }
          }
        },
        {
          label: 'Save Project',
          accelerator: 'CmdOrCtrl+S',
          click: () => {
            mainWindow.webContents.send('request-save')
          }
        },
        { type: 'separator' },
        { role: 'quit' }
      ]
    },
    {
      label: 'Edit',
      submenu: [
        { role: 'undo' },
        { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        { role: 'delete' },
        { type: 'separator' },
        { role: 'selectAll' }
      ]
    },
    {
      label: 'View',
      submenu: [
        { role: 'reload' },
        { role: 'forceReload' },
        { role: 'toggleDevTools' },
        { type: 'separator' },
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { type: 'separator' },
        { role: 'togglefullscreen' }
      ]
    },
    { role: 'windowMenu' as const },
    { role: 'viewMenu' as const },
    { role: 'windowMenu' as const }
  ]
  // @ts-ignore
  const menu = Menu.buildFromTemplate(template)
  Menu.setApplicationMenu(menu)
}

function createWindow(): void {
  const mainWindow = new BrowserWindow({
    width: 900,
    height: 670,
    show: false,
    autoHideMenuBar: true,
    ...(process.platform === 'linux' ? { icon } : {}),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false
    }
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow.show()
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

app.whenReady().then(() => {
  createWindow()
  electronApp.setAppUserModelId('com.electron')
  
  const wins = BrowserWindow.getAllWindows()
  if (wins.length > 0) createMenu(wins[0])

  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  // 🟢 1. 读取文件
  ipcMain.handle('read-file', async (_event, filePath: string) => {
    try {
      const content = await readFile(filePath, 'utf-8')
      return { success: true, content }
    } catch (error: any) {
      return { success: false, error: error.message }
    }
  })

  ipcMain.handle('read-buffer', async (_event, filePath: string) => {
    try {
      // ⚠️ 关键：不传 'utf-8'，让它返回原始 Buffer
      const buffer = await readFile(filePath) 
      return { success: true, data: buffer }
    } catch (error: any) {
      return { success: false, error: error.message }
    }
  })

  // 🟢 2. 通用文件写入 [新增]
  // 用于保存宏、脚本、或其他通用文件
  ipcMain.handle('write-file', async (_event, { path, data }) => {
    try {
      await writeFile(path, data, 'utf-8')
      return { success: true }
    } catch (error: any) {
      return { success: false, error: error.message }
    }
  })

  // 🟢 3. 读取目录结构 [新增]
  // 用于资源管理器 (Asset Browser)
  ipcMain.handle('read-dir', async (_event, dirPath: string) => {
    try {
      // 读取目录下的所有文件/文件夹名称
      const files = await readdir(dirPath)
      const entries: any[] = []
      
      // 遍历获取详细信息 (是否为文件夹)
      for (const file of files) {
        // 忽略隐藏文件 (以 . 开头)
        if (file.startsWith('.')) continue
        
        const fullPath = join(dirPath, file)
        const stats = await stat(fullPath)
        entries.push({
          name: file,
          isDirectory: stats.isDirectory(),
          path: fullPath
        })
      }
      return { success: true, files: entries }
    } catch (e: any) {
      return { success: false, error: e.message }
    }
  })

  // 🟢 4. 保存项目 (内部专用)
  ipcMain.handle('save-project-file', async (_event, { path, data }) => {
    try {
      const target = join(path, 'project.json')
      await writeFile(target, data, 'utf-8')
      return { success: true }
    } catch (error: any) {
      return { success: false, error: error.message }
    }
  })

  // 🟢 5. 项目另存为
  ipcMain.handle('save-project-as', async (_event, sceneJsonString: string) => {
    const window = BrowserWindow.getFocusedWindow()
    if (!window) return { success: false, error: 'No active window' }

    const result = await dialog.showOpenDialog(window, {
      title: 'Select Folder to Save Project',
      properties: ['openDirectory', 'createDirectory', 'promptToCreate'],
      buttonLabel: 'Create Project Here'
    })

    if (result.canceled || result.filePaths.length === 0) {
      return { success: false, canceled: true }
    }

    const projectPath = result.filePaths[0]

    try {
      const scriptsDir = join(projectPath, 'scripts')
      const assetsDir = join(projectPath, 'assets')
      if (!existsSync(scriptsDir)) {
        await mkdir(scriptsDir, { recursive: true })
      }

      if (!existsSync(assetsDir)) {
        await mkdir(assetsDir, { recursive: true })
      }

      const projectFile = join(projectPath, 'project.json')
      await writeFile(projectFile, sceneJsonString, 'utf-8')

      return { success: true, path: projectPath }
    } catch (error: any) {
      return { success: false, error: error.message }
    }
  })
  
  // 🟢 6. 读取项目文件
  ipcMain.handle('load-project-file', async (_event, projectRoot) => {
    try {
      const target = join(projectRoot, 'project.json')
      const content = await readFile(target, 'utf-8')
      return { success: true, data: content }
    } catch (error: any) {
      return { success: false, error: error.message }
    }
  })
  
  // 🟢 7. 路径拼接
  ipcMain.handle('path-join', (_event, ...args) => {
    return join(...args)
  })

  // 🟢 [新增] 删除文件或文件夹 (递归删除)
  ipcMain.handle('delete-path', async (_event, path: string) => {
    try {
      // recursive: true 允许删除非空文件夹, force: true 忽略不存在的文件
      await rm(path, { recursive: true, force: true })
      return { success: true }
    } catch (error: any) {
      return { success: false, error: error.message }
    }
  })

  // 🟢 [新增] 重命名 / 移动
  ipcMain.handle('rename-path', async (_event, { oldPath, newPath }) => {
    try {
      await rename(oldPath, newPath)
      return { success: true }
    } catch (error: any) {
      return { success: false, error: error.message }
    }
  })

  // 🟢 [新增] 创建文件夹
  ipcMain.handle('create-dir', async (_event, path: string) => {
    try {
      await mkdir(path, { recursive: true }) // recursive: true 允许创建嵌套目录 (a/b/c)
      return { success: true }
    } catch (error: any) {
      return { success: false, error: error.message }
    }
  })

  // 🟢 [新增] 复制文件
  ipcMain.handle('copy-file', async (_event, { src, dest }) => {
    try {
      await copyFile(src, dest)
      return { success: true }
    } catch (error: any) {
      return { success: false, error: error.message }
    }
  })

  // 🟢 [新增] 检查路径是否存在 (比 readFile 更高效)
  ipcMain.handle('path-exists', async (_event, path: string) => {
    try {
      await access(path)
      return true
    } catch {
      return false
    }
  })

  app.on('activate', function () {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})