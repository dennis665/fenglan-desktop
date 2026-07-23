const { app, BrowserWindow, ipcMain, screen, dialog } = require('electron');
const path = require('path');
const os = require('os');
const fs = require('fs');

// Disable GPU Hardware Acceleration to completely bypass Chromium transparent window memory leaks and DWM bloating!
app.disableHardwareAcceleration();

// Optimize memory, GPU, and frame-rate footprint
app.commandLine.appendSwitch('limit-fps', '30');                     // Cap frame rate to 30 FPS to save CPU/GPU/DWM cycles
app.commandLine.appendSwitch('js-flags', '--max-old-space-size=256'); // Restrict V8 heap size
app.commandLine.appendSwitch('disable-gpu-shader-disk-cache');       // Disable shader cache to save RAM
app.commandLine.appendSwitch('disable-http-cache');                  // Disable HTTP cache
app.commandLine.appendSwitch('force-gpu-mem-available-mb', '128');   // Force GPU process to limit VRAM/texture cache to 128MB
app.commandLine.appendSwitch('gpu-program-cache-size-kb', '1024');   // Restrict GPU shader program cache size
app.commandLine.appendSwitch('force-device-scale-factor', '1');      // Disable DPI scaling mismatch by forcing 100% scale factor

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

let windows = [];
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

let systemMonitorInterval = null;

function createWindow() {
  const displays = screen.getAllDisplays();
  
  displays.forEach((display, index) => {
    const win = new BrowserWindow({
      x: display.bounds.x,
      y: display.bounds.y,
      width: display.bounds.width,
      height: display.bounds.height - 1, // Subtract 1px to bypass Windows fullscreen composition optimization
      transparent: true,
      frame: false,
      alwaysOnTop: true,
      resizable: false,
      movable: false,
      hasShadow: false,
      focusable: true, // Allow focus to capture blur events when clicking other windows/displays
      skipTaskbar: true, // Don't show in Windows taskbar for stealth look
      show: false, // Prevents black flashes
      backgroundColor: '#00000000', // Explicit transparent background
      webPreferences: {
        nodeIntegration: true,
        contextIsolation: false
      }
    });

    // Pass the screenIndex as query param so the renderer knows which display it belongs to
    win.loadFile('index.html', { query: { screenIndex: index.toString() } });

    // Show when ready to prevent any black compositor boxes
    win.once('ready-to-show', () => {
      win.show();
    });

    // Start with click-through enabled immediately on launch
    win.setIgnoreMouseEvents(true, { forward: true });

    win.on('closed', () => {
      windows = windows.filter(w => w !== win);
      if (windows.length === 0 && systemMonitorInterval) {
        clearInterval(systemMonitorInterval);
        systemMonitorInterval = null;
      }
    });

    windows.push(win);
  });

  // Start system resource polling if not already running
  if (!systemMonitorInterval) {
    systemMonitorInterval = setInterval(async () => {
      const allWindows = BrowserWindow.getAllWindows();
      if (allWindows.length === 0) return;
      
      const cpuUsage = await calculateCPUUsage();
      const totalMem = os.totalmem();
      const freeMem = os.freemem();
      const memUsage = Math.round(((totalMem - freeMem) / totalMem) * 100);
      
      const payload = {
        cpu: cpuUsage,
        memory: memUsage,
        freeMemMB: Math.round(freeMem / (1024 * 1024)),
        time: new Date().toLocaleTimeString('zh-TW', { hour12: false })
      };
      
      for (const w of allWindows) {
        if (!w.isDestroyed()) {
          w.webContents.send('system-status', payload);
        }
      }
    }, 3000);
  }
}

// Set ignore mouse events on transparent areas of the sending window
ipcMain.on('set-ignore-mouse', (event, ignore, options) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  if (win && !win.isDestroyed()) {
    win.setIgnoreMouseEvents(ignore, options || { forward: true });
  }
});

// Native File dialog trigger for secure and reliable local file uploads
ipcMain.handle('show-open-dialog', async (event) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  const result = await dialog.showOpenDialog(win, {
    properties: ['openFile'],
    filters: [{ name: 'WebP Images', extensions: ['webp'] }]
  });
  if (result.canceled || result.filePaths.length === 0) return null;
  return result.filePaths[0];
});

// Native File dialog for media files (supporting multi-selection!)
ipcMain.handle('show-media-dialog', async (event) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  const result = await dialog.showOpenDialog(win, {
    properties: ['openFile', 'multiSelections'],
    filters: [
      { name: 'Audio/Video Files', extensions: ['mp3', 'wav', 'mp4', 'webm', 'ogg'] }
    ]
  });
  if (result.canceled || result.filePaths.length === 0) return null;
  return result.filePaths;
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

// Get total connected displays count
ipcMain.handle('get-displays-count', () => {
  return screen.getAllDisplays().length;
});

// Broadcast IPC messages to all windows except the sender
ipcMain.on('broadcast-ipc', (event, channel, ...args) => {
  const allWindows = BrowserWindow.getAllWindows();
  for (const w of allWindows) {
    if (w.webContents !== event.sender && !w.isDestroyed()) {
      w.webContents.send(channel, ...args);
    }
  }
});

// Get matching monitor info matching the current window
ipcMain.handle('get-window-bounds', (event) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  if (win && !win.isDestroyed()) {
    const bounds = win.getBounds();
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

// Allow single instance only
const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (windows.length > 0) {
      const firstWin = windows[0];
      if (firstWin.isMinimized()) firstWin.restore();
      firstWin.focus();
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
