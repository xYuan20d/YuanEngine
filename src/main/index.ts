import { app, shell, BrowserWindow, ipcMain, Menu, dialog } from 'electron'
import { join, resolve } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import icon from '../../resources/icon.png?asset'
import { readFile, writeFile, mkdir } from 'fs/promises'
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
              properties: ['openDirectory'] // 只允许选文件夹
            })
            if (!result.canceled && result.filePaths.length > 0) {
              const projectPath = result.filePaths[0]
              // 通知前端：项目打开了，把路径传过去
              mainWindow.webContents.send('project-opened', projectPath)
            }
          }
        },
        {
          label: 'Save Project',
          accelerator: 'CmdOrCtrl+S',
          click: () => {
            // 通知前端：该交作业了（把数据发给我）
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

    // 3. View 菜单 (方便调试)
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
    
    // Window 菜单
    { role: 'windowMenu' },
    { role: 'viewMenu' }, // 方便调试，保留开发者工具
    { role: 'windowMenu' }
  ]
  // @ts-ignore
  const menu = Menu.buildFromTemplate(template)
  Menu.setApplicationMenu(menu)
}

function createWindow(): void {
  // Create the browser window.
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

  // HMR for renderer base on electron-vite cli.
  // Load the remote URL for development or the local html file for production.
  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
app.whenReady().then(() => {
  createWindow()
  // Set app user model id for windows
  electronApp.setAppUserModelId('com.electron')

  // Default open or close DevTools by F12 in development
  // and ignore CommandOrControl + R in production.
  // see https://github.com/alex8088/electron-toolkit/tree/master/packages/utils

  createMenu(BrowserWindow.getAllWindows()[0] as BrowserWindow)
  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  // 🟢 2. 注册 IPC：读取文件 (增强版，支持绝对和相对路径)
  // 我们不再只读绝对路径，而是由前端传过来完整路径
  ipcMain.handle('read-file', async (_event, filePath: string) => {
    try {
      const content = await readFile(filePath, 'utf-8')
      return { success: true, content }
    } catch (error: any) {
      return { success: false, error: error.message }
    }
  })

  // 🟢 3. 注册 IPC：保存项目文件
  ipcMain.handle('save-project-file', async (_event, { path, data }) => {
    try {
      // 在项目根目录下写入 project.json
      const target = join(path, 'project.json')
      await writeFile(target, data, 'utf-8')
      return { success: true }
    } catch (error: any) {
      return { success: false, error: error.message }
    }
  })

  ipcMain.handle('save-project-as', async (_event, sceneJsonString: string) => {
  const window = BrowserWindow.getFocusedWindow()
  if (!window) return { success: false, error: 'No active window' }

  // 1. 弹出文件夹选择框 (允许新建文件夹)
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
    // 2. 确保 scripts 文件夹存在 (自动创建基础结构)
    const scriptsDir = join(projectPath, 'scripts')
    if (!existsSync(scriptsDir)) {
      await mkdir(scriptsDir, { recursive: true })
    }

    // 3. 写入 project.json
    const projectFile = join(projectPath, 'project.json')
    await writeFile(projectFile, sceneJsonString, 'utf-8')

    // 4. 返回成功的路径，让前端更新状态
    return { success: true, path: projectPath }
  } catch (error: any) {
    return { success: false, error: error.message }
  }
  })
  
  // 🟢 4. 注册 IPC：读取项目文件 (打开项目时用)
  ipcMain.handle('load-project-file', async (_event, projectRoot) => {
    try {
      const target = join(projectRoot, 'project.json')
      const content = await readFile(target, 'utf-8')
      return { success: true, data: content }
    } catch (error: any) {
      return { success: false, error: error.message }
    }
  })
  
  // 🟢 5. 路径拼接工具 (解决 Windows/Mac 斜杠差异)
  ipcMain.handle('path-join', (_event, ...args) => {
    return join(...args)
  })

  // IPC test
  ipcMain.on('ping', () => console.log('pong'))

  app.on('activate', function () {
    // On macOS it's common to re-create a window in the app when the
    // dock icon is clicked and there are no other windows open.
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

// Quit when all windows are closed, except on macOS. There, it's common
// for applications and their menu bar to stay active until the user quits
// explicitly with Cmd + Q.
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

// In this file you can include the rest of your app's specific main process
// code. You can also put them in separate files and require them here.
