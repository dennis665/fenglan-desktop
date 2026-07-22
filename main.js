const { app, BrowserWindow, ipcMain, screen, dialog } = require('electron');
const path = require('path');
const os = require('os');
const fs = require('fs');

// Disable GPU Hardware Acceleration to completely bypass Chromium transparent window memory leaks and DWM bloating!
app.disableHardwareAcceleration();

// Optimize memory and GPU resource footprint
app.commandLine.appendSwitch('js-flags', '--max-old-space-size=256'); // Restrict V8 heap size
app.commandLine.appendSwitch('disable-gpu-shader-disk-cache');       // Disable shader cache to save RAM
app.commandLine.appendSwitch('disable-http-cache');                  // Disable HTTP cache

// Load local .env file synchronously on startup and populate process.env
try {
  const envPath = path.join(__dirname, '.env');
  if (fs.existsSync(envPath)) {
    const content = fs.readFileSync(envPath, 'utf8');
    content.split(/\r?\n/).forEach(line => {
      const trimmed = line.trim();
      if (trimmed && !trimmed.startsWith('#')) {
        const [key, ...valParts] = trimmed.split('=');
        if (key) {
          process.env[key.trim()] = valParts.join('=').trim();
        }
      }
    });
  }
} catch (e) {
  console.error("Error loading .env file:", e);
}

let mainWindow;
let cpuTracking = { idle: 0, total: 0 };

function getCPUUsage() {
  const cpus = os.cpus();
  let idle = 0;
  let total = 0;
  for (const cpu of cpus) {
    for (const type in cpu.times) {
      total += cpu.times[type];
    }
    idle += cpu.times.idle;
  }
  return { idle, total };
}

// Calculate CPU usage percentage
function calculateCPUUsage() {
  const start = getCPUUsage();
  return new Promise((resolve) => {
    setTimeout(() => {
      const end = getCPUUsage();
      const idleDiff = end.idle - start.idle;
      const totalDiff = end.total - start.total;
      if (totalDiff === 0) return resolve(0);
      const usage = 1 - idleDiff / totalDiff;
      resolve(Math.round(usage * 100));
    }, 200);
  });
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 450,
    height: 350,
    transparent: true,
    frame: false,
    alwaysOnTop: true,
    resizable: false,
    hasShadow: false,
    skipTaskbar: true, // Don't show in Windows taskbar for stealth look
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false
    }
  });

  mainWindow.loadFile('index.html');

  // Position window at bottom right of the primary screen, above taskbar
  const primaryDisplay = screen.getPrimaryDisplay();
  const { width, height } = primaryDisplay.workAreaSize;
  const windowWidth = 450;
  const windowHeight = 350;
  
  // Set position to bottom right
  mainWindow.setPosition(width - windowWidth - 20, height - windowHeight - 10);

  // Set ignore mouse events on transparent areas
  ipcMain.on('set-ignore-mouse', (event, ignore, options) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.setIgnoreMouseEvents(ignore, options || { forward: true });
    }
  });

  // Native File dialog trigger for secure and reliable local file uploads
  ipcMain.handle('show-open-dialog', async (event) => {
    const result = await dialog.showOpenDialog(mainWindow, {
      properties: ['openFile'],
      filters: [{ name: 'WebP Images', extensions: ['webp'] }]
    });
    if (result.canceled || result.filePaths.length === 0) return null;
    return result.filePaths[0];
  });

  // Native File dialog for media files (supporting multi-selection!)
  ipcMain.handle('show-media-dialog', async (event) => {
    const result = await dialog.showOpenDialog(mainWindow, {
      properties: ['openFile', 'multiSelections'],
      filters: [
        { name: 'Audio/Video Files', extensions: ['mp3', 'wav', 'mp4', 'webm', 'ogg'] }
      ]
    });
    if (result.canceled || result.filePaths.length === 0) return null;
    return result.filePaths;
  });

  // Handle manual window moving via mouse drag from renderer
  let startX = 0;
  let startY = 0;
  ipcMain.on('drag-start', (event, clientX, clientY) => {
    const cursor = screen.getCursorScreenPoint();
    const winBounds = mainWindow.getBounds();
    startX = cursor.x - winBounds.x;
    startY = cursor.y - winBounds.y;
  });

  ipcMain.on('drag-move', () => {
    const cursor = screen.getCursorScreenPoint();
    mainWindow.setBounds({
      x: cursor.x - startX,
      y: cursor.y - startY,
      width: 450,
      height: 350
    });
  });

  ipcMain.on('close-app', () => {
    app.quit();
  });

  ipcMain.handle('get-app-memory', () => {
    try {
      const metrics = app.getAppMetrics();
      let totalMemoryKB = 0;
      for (const m of metrics) {
        if (m.memory && m.memory.workingSetSize) {
          totalMemoryKB += m.memory.workingSetSize;
        }
      }
      return Math.round(totalMemoryKB / 1024); // Return in MB
    } catch (e) {
      return 0;
    }
  });

  ipcMain.on('relaunch-app', () => {
    app.relaunch();
    app.exit(0);
  });

  // Position control from renderer with input validation
  ipcMain.on('set-window-position', (event, x, y) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      const posX = Math.round(Number(x));
      const posY = Math.round(Number(y));
      if (Number.isInteger(posX) && Number.isInteger(posY)) {
        mainWindow.setPosition(posX, posY);
      }
    }
  });

  ipcMain.handle('get-window-bounds', () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      const bounds = mainWindow.getBounds();
      const display = screen.getDisplayMatching(bounds);
      return {
        x: bounds.x,
        y: bounds.y,
        width: bounds.width,
        height: bounds.height,
        screenWidth: display.bounds.width,
        screenHeight: display.bounds.height,
        displayX: display.bounds.x,
        displayY: display.bounds.y,
        workX: display.workArea.x,
        workY: display.workArea.y,
        workWidth: display.workArea.width,
        workHeight: display.workArea.height
      };
    }
    return null;
  });

  // Send system info updates to the renderer every 3 seconds
  const systemMonitorInterval = setInterval(async () => {
    if (!mainWindow || mainWindow.isDestroyed()) return;
    
    const cpuUsage = await calculateCPUUsage();
    
    // Memory
    const totalMem = os.totalmem();
    const freeMem = os.freemem();
    const memUsage = Math.round(((totalMem - freeMem) / totalMem) * 100);
    
    mainWindow.webContents.send('system-status', {
      cpu: cpuUsage,
      memory: memUsage,
      freeMemMB: Math.round(freeMem / (1024 * 1024)),
      time: new Date().toLocaleTimeString('zh-TW', { hour12: false })
    });
  }, 3000);

  mainWindow.on('closed', () => {
    clearInterval(systemMonitorInterval);
    mainWindow = null;
  });
}

// Allow single instance only
const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });

  app.whenReady().then(createWindow);
}

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});
