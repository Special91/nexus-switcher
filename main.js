const { app, BrowserWindow, ipcMain, Tray, Menu, nativeImage, safeStorage, dialog, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');
const https = require('https');
const { exec } = require('child_process');

app.commandLine.appendSwitch('disable-gpu-shader-disk-cache');
app.commandLine.appendSwitch('disk-cache-dir', path.join(require('os').tmpdir(), 'nexus-switcher-cache'));

let mainWindow;
let tray = null;
let isQuitting = false;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1000,
    height: 700,
    minWidth: 800,
    minHeight: 600,
    backgroundColor: '#0f172a',
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false
    },
    autoHideMenuBar: true
  });

  mainWindow.loadFile('index.html');

  // Prevent app from closing, minimize to tray instead
  mainWindow.on('close', function (event) {
    if (!isQuitting) {
      event.preventDefault();
      mainWindow.hide();
      return false;
    }
  });
}

function createTray() {
  // In a real app, use a proper icon.ico file
  // Here we'll create a simple empty nativeImage or use a placeholder
  const iconPath = path.join(__dirname, 'icon.png');
  
  if (fs.existsSync(iconPath)) {
    tray = new Tray(iconPath);
  } else {
    // Empty tray if no icon exists
    const emptyImg = nativeImage.createEmpty();
    tray = new Tray(emptyImg);
  }

  const contextMenu = Menu.buildFromTemplate([
    { label: 'فتح Nexus Switcher', click: () => mainWindow.show() },
    { type: 'separator' },
    { label: 'إغلاق البرنامج', click: () => {
        isQuitting = true;
        app.quit();
      } 
    }
  ]);
  
  tray.setToolTip('Nexus Switcher');
  tray.setContextMenu(contextMenu);

  tray.on('click', () => {
    mainWindow.show();
  });
}

app.whenReady().then(() => {
  createWindow();
  createTray();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// IPC handler to get Steam path from registry
ipcMain.handle('get-steam-path', () => {
  return new Promise((resolve, reject) => {
    exec('reg query HKCU\\Software\\Valve\\Steam /v SteamPath', (error, stdout, stderr) => {
      if (error) {
        console.error('Error reading registry:', error);
        return resolve(null);
      }
      
      // Parse output: "    SteamPath    REG_SZ    c:/program files (x86)/steam"
      const match = stdout.match(/REG_SZ\s+(.+)/);
      if (match && match[1]) {
        resolve(match[1].trim());
      } else {
        resolve(null);
      }
    });
  });
});

// IPC handler to launch Steam with specific account
ipcMain.handle('launch-steam', async (event, steamId) => {
    return new Promise((resolve, reject) => {
        // First kill steam if it's running
        exec('taskkill /F /IM steam.exe', (error) => {
            // It doesn't matter if it fails (steam wasn't running)
            
            // Get steam path
            exec('reg query HKCU\\Software\\Valve\\Steam /v SteamExe', (err, stdout) => {
                const match = stdout.match(/REG_SZ\s+(.+)/);
                if (match && match[1]) {
                    const steamExe = match[1].trim();
                    // Launch steam with the specified account (this requires modifying registry or AutoLoginUser)
                    // We will set AutoLoginUser in registry
                    resolve({ success: true, steamExe });
                } else {
                    resolve({ success: false, message: 'Could not find Steam executable' });
                }
            });
        });
    });
});

ipcMain.handle('set-autostart', (event, enable) => {
    try {
        const settings = {
            openAtLogin: enable,
            path: process.execPath
        };
        if (!app.isPackaged) {
            settings.args = [path.resolve(__dirname)];
        }
        app.setLoginItemSettings(settings);
        // Verify it was set correctly
        const result = app.getLoginItemSettings();
        return result.openAtLogin;
    } catch(e) {
        console.error('Autostart error:', e);
        return !enable; // Return opposite = failed
    }
});

ipcMain.handle('get-autostart', () => {
    try {
        const settings = app.getLoginItemSettings();
        return settings.openAtLogin;
    } catch(e) {
        return false;
    }
});

// ===== Encryption (safeStorage - OS-bound, no password needed) =====
ipcMain.handle('encrypt-data', (event, plaintext) => {
    try {
        if (!safeStorage.isEncryptionAvailable()) return { success: false, data: plaintext };
        const encrypted = safeStorage.encryptString(plaintext);
        return { success: true, data: encrypted.toString('base64') };
    } catch(e) {
        return { success: false, error: e.message, data: plaintext };
    }
});

ipcMain.handle('decrypt-data', (event, base64data) => {
    try {
        if (!safeStorage.isEncryptionAvailable()) return { success: false, data: base64data };
        const buffer = Buffer.from(base64data, 'base64');
        const decrypted = safeStorage.decryptString(buffer);
        return { success: true, data: decrypted };
    } catch(e) {
        return { success: false, error: e.message, data: null };
    }
});

ipcMain.handle('encryption-available', () => safeStorage.isEncryptionAvailable());

// ===== System Performance Monitor =====
let lastCpuInfo = os.cpus();

function getCpuUsage() {
    const cpus = os.cpus();
    let totalIdle = 0, totalTick = 0;
    for (let i = 0; i < cpus.length; i++) {
        const cpu = cpus[i];
        const lastCpu = lastCpuInfo[i];
        const tickDiff = Object.values(cpu.times).reduce((a, b) => a + b, 0) -
                         Object.values(lastCpu.times).reduce((a, b) => a + b, 0);
        const idleDiff = cpu.times.idle - lastCpu.times.idle;
        totalTick += tickDiff;
        totalIdle += idleDiff;
    }
    lastCpuInfo = cpus;
    if (totalTick === 0) return 0;
    return Math.max(0, Math.min(100, Math.round(100 - (100 * totalIdle / totalTick))));
}

ipcMain.handle('get-system-stats', async () => {
    const totalMem = os.totalmem();
    const freeMem = os.freemem();
    const usedMem = totalMem - freeMem;
    
    return {
        cpu: {
            usage: getCpuUsage(),
            cores: os.cpus().length,
            model: os.cpus()[0].model
        },
        ram: {
            total: totalMem,
            used: usedMem,
            free: freeMem,
            usagePercent: Math.round((usedMem / totalMem) * 100),
            totalGB: (totalMem / 1073741824).toFixed(1),
            usedGB: (usedMem / 1073741824).toFixed(1)
        },
        uptime: os.uptime(),
        platform: os.platform(),
        hostname: os.hostname()
    };
});

ipcMain.handle('get-gpu-stats', () => {
    return new Promise((resolve) => {
        // Try nvidia-smi first
        exec('nvidia-smi --query-gpu=name,utilization.gpu,memory.used,memory.total,temperature.gpu --format=csv,noheader,nounits', (err, stdout) => {
            if (!err && stdout.trim()) {
                const parts = stdout.trim().split(',').map(s => s.trim());
                return resolve({
                    available: true,
                    name: parts[0],
                    usage: parseInt(parts[1]) || 0,
                    memUsed: parseInt(parts[2]) || 0,
                    memTotal: parseInt(parts[3]) || 0,
                    temp: parseInt(parts[4]) || 0,
                    type: 'nvidia'
                });
            }
            // Fallback: try Windows Performance Counter for GPU
            exec('powershell -Command "(Get-Counter \'\\GPU Engine(*engtype_3D)\\Utilization Percentage\' -ErrorAction SilentlyContinue).CounterSamples | Where-Object {$_.CookedValue -gt 0} | Measure-Object -Property CookedValue -Sum | Select-Object -ExpandProperty Sum"', (err2, stdout2) => {
                const usage = parseFloat(stdout2);
                if (!isNaN(usage)) {
                    return resolve({ available: true, name: 'GPU', usage: Math.min(100, Math.round(usage)), type: 'generic' });
                }
                resolve({ available: false });
            });
        });
    });
});

// ===== Update Checker (checks GitHub releases) =====
ipcMain.handle('check-updates', () => {
    return new Promise((resolve) => {
        const currentVersion = app.getVersion();
        // Use a public endpoint - user can configure their own GitHub repo
        const options = {
            hostname: 'api.github.com',
            path: '/repos/electron/electron/releases/latest', // placeholder - user should change to their repo
            headers: { 'User-Agent': 'NexusSwitcher' },
            timeout: 5000
        };
        
        // Read repo from package.json if available
        try {
            const pkg = require('./package.json');
            if (pkg.repository && pkg.repository.url) {
                const match = pkg.repository.url.match(/github\.com[:/]([\w-]+)\/([\w-]+)/);
                if (match) {
                    options.path = `/repos/${match[1]}/${match[2].replace('.git','')}/releases/latest`;
                }
            }
        } catch(e) {}
        
        const req = https.get(options, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                try {
                    const release = JSON.parse(data);
                    const latestVersion = (release.tag_name || '').replace(/^v/, '');
                    if (!latestVersion) return resolve({ success: false, error: 'no_release', current: currentVersion });
                    const isNewer = compareVersions(latestVersion, currentVersion) > 0;
                    resolve({
                        success: true,
                        current: currentVersion,
                        latest: latestVersion,
                        hasUpdate: isNewer,
                        url: release.html_url,
                        notes: release.body || ''
                    });
                } catch(e) {
                    resolve({ success: false, error: 'parse_error', current: currentVersion });
                }
            });
        });
        req.on('error', () => resolve({ success: false, error: 'network', current: currentVersion }));
        req.on('timeout', () => { req.destroy(); resolve({ success: false, error: 'timeout', current: currentVersion }); });
    });
});

function compareVersions(a, b) {
    const pa = a.split('.').map(n => parseInt(n) || 0);
    const pb = b.split('.').map(n => parseInt(n) || 0);
    for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
        const diff = (pa[i] || 0) - (pb[i] || 0);
        if (diff !== 0) return diff;
    }
    return 0;
}

ipcMain.handle('open-external', (event, url) => {
    shell.openExternal(url);
});

ipcMain.handle('app-version', () => app.getVersion());

// ===== Backup / Import / Export =====
ipcMain.handle('export-backup', async () => {
    const result = await dialog.showSaveDialog(mainWindow, {
        title: 'حفظ النسخة الاحتياطية',
        defaultPath: `nexus-backup-${new Date().toISOString().split('T')[0]}.json`,
        filters: [{ name: 'JSON Backup', extensions: ['json'] }]
    });
    if (result.canceled || !result.filePath) return { success: false, canceled: true };
    return { success: true, filePath: result.filePath };
});

ipcMain.handle('import-backup', async () => {
    const result = await dialog.showOpenDialog(mainWindow, {
        title: 'اختر ملف النسخة الاحتياطية',
        filters: [{ name: 'JSON Backup', extensions: ['json'] }],
        properties: ['openFile']
    });
    if (result.canceled || result.filePaths.length === 0) return { success: false, canceled: true };
    return { success: true, filePath: result.filePaths[0] };
});

// ===== Process Monitor for Playtime Tracking =====
ipcMain.handle('is-process-running', (event, processName) => {
    return new Promise((resolve) => {
        exec(`tasklist /FI "IMAGENAME eq ${processName}" /NH`, (err, stdout) => {
            resolve(!err && stdout.toLowerCase().includes(processName.toLowerCase()));
        });
    });
});

ipcMain.handle('list-running-games', () => {
    return new Promise((resolve) => {
        // Get all processes and filter likely game executables
        exec('tasklist /FO CSV /NH', (err, stdout) => {
            if (err) return resolve([]);
            const lines = stdout.split('\n').map(l => {
                const m = l.match(/^"([^"]+)"/);
                return m ? m[1].toLowerCase() : null;
            }).filter(Boolean);
            resolve(lines);
        });
    });
});

ipcMain.handle('user-data-path', () => app.getPath('userData'));

// ===== Steam Server Status (via crowbar.steamstat.us) =====
ipcMain.handle('get-steam-status', () => {
    return new Promise((resolve) => {
        const options = {
            hostname: 'crowbar.steamstat.us',
            path: '/Barney',
            headers: { 'User-Agent': 'NexusSwitcher' },
            timeout: 6000
        };
        const req = https.get(options, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                try {
                    const parsed = JSON.parse(data);
                    // Barney returns: { services: { "Steam Store": ["normal", "Operating Normally", timestamp], ... } }
                    const services = parsed.services || {};
                    const result = {};
                    for (const key in services) {
                        const v = services[key];
                        if (Array.isArray(v) && v.length >= 2) {
                            result[key] = { status: v[0], title: v[1] };
                        }
                    }
                    resolve({ success: true, services: result });
                } catch(e) {
                    resolve({ success: false, error: 'parse_error' });
                }
            });
        });
        req.on('error', () => resolve({ success: false, error: 'network' }));
        req.on('timeout', () => { req.destroy(); resolve({ success: false, error: 'timeout' }); });
    });
});
