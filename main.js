const { app, BrowserWindow, ipcMain, Tray, Menu, nativeImage, safeStorage, dialog, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');
const https = require('https');
const { exec } = require('child_process');

app.commandLine.appendSwitch('disable-gpu-shader-disk-cache');
// Removed explicit disk-cache-dir to prevent access denied errors

let mainWindow;
let tray = null;
let isQuitting = false;

const SESSIONS_DIR = path.join(app.getPath('userData'), 'PlatformSessions');
const PLATFORM_INFO = {
    epic: { process: 'EpicGamesLauncher.exe', path: path.join(os.homedir(), 'AppData', 'Local', 'EpicGamesLauncher', 'Saved') },
    riot: { process: 'RiotClientServices.exe', path: path.join(os.homedir(), 'AppData', 'Local', 'Riot Games', 'Riot Client', 'Data') },
    ea: { process: 'EADesktop.exe', path: path.join(os.homedir(), 'AppData', 'Local', 'Electronic Arts', 'EA Desktop') },
    ubisoft: { process: 'upc.exe', path: path.join(os.homedir(), 'AppData', 'Local', 'Ubisoft Game Launcher') },
    battlenet: { process: 'Battle.net.exe', path: path.join(os.homedir(), 'AppData', 'Roaming', 'Battle.net') }
};

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

async function killPlatformProcesses(platform) {
    const processes = {
        ea: ['EADesktop.exe', 'EABackgroundService.exe', 'Link2EA.exe'],
        epic: ['EpicGamesLauncher.exe', 'EpicWebHelper.exe'],
        riot: ['RiotClientServices.exe'],
        ubisoft: ['upc.exe'],
        battlenet: ['Battle.net.exe', 'Agent.exe']
    };
    const list = processes[platform] || [];
    for (const proc of list) {
        await new Promise(r => exec(`taskkill /F /IM ${proc} /T`, () => r()));
    }
    await new Promise(r => setTimeout(r, 1000));
}

ipcMain.handle('save-platform-session', async (event, platform, accountName) => {
    try {
        const info = PLATFORM_INFO[platform];
        if (!info || !fs.existsSync(info.path)) throw new Error('Platform data not found or not installed.');
        
        // Kill processes holding locks
        await killPlatformProcesses(platform);

        const targetDir = path.join(SESSIONS_DIR, platform, accountName);
        if (!fs.existsSync(targetDir)) fs.mkdirSync(targetDir, { recursive: true });

        fs.cpSync(info.path, targetDir, { recursive: true, force: true });
        return { success: true };
    } catch (e) {
        return { success: false, error: e.message };
    }
});

ipcMain.handle('switch-platform-session', async (event, platform, accountName) => {
    try {
        const info = PLATFORM_INFO[platform];
        const sourceDir = path.join(SESSIONS_DIR, platform, accountName);
        
        if (!info || !fs.existsSync(sourceDir)) throw new Error('Session not found.');

        // Kill processes holding locks
        await killPlatformProcesses(platform);

        if (fs.existsSync(info.path)) {
            fs.rmSync(info.path, { recursive: true, force: true });
        }
        fs.mkdirSync(info.path, { recursive: true });
        fs.cpSync(sourceDir, info.path, { recursive: true, force: true });

        return { success: true };
    } catch (e) {
        return { success: false, error: e.message };
    }
});

ipcMain.handle('get-platform-sessions', () => {
    const sessions = {};
    for (const plat of Object.keys(PLATFORM_INFO)) {
        sessions[plat] = [];
        const pDir = path.join(SESSIONS_DIR, plat);
        if (fs.existsSync(pDir)) {
            sessions[plat] = fs.readdirSync(pDir, { withFileTypes: true })
                               .filter(dirent => dirent.isDirectory())
                               .map(dirent => dirent.name);
        }
    }
    return sessions;
});

ipcMain.handle('delete-platform-session', async (event, platform, accountName) => {
    try {
        const sourceDir = path.join(SESSIONS_DIR, platform, accountName);
        if (fs.existsSync(sourceDir)) {
            fs.rmSync(sourceDir, { recursive: true, force: true });
        }
        return { success: true };
    } catch (e) {
        return { success: false, error: e.message };
    }
});

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

// ===== Steam Server Status (direct HTTP probes - more reliable) =====
function probeService(hostname, path = '/', timeoutMs = 5000) {
    return new Promise((resolve) => {
        const start = Date.now();
        const req = https.request({
            hostname,
            path,
            method: 'HEAD',
            timeout: timeoutMs,
            headers: { 'User-Agent': 'NexusSwitcher/1.0' }
        }, (res) => {
            const latency = Date.now() - start;
            const status = res.statusCode;
            // Determine status: 2xx/3xx = normal, 5xx = major, others = minor
            let label;
            if (status >= 200 && status < 400) label = latency > 2000 ? 'minor' : 'normal';
            else if (status >= 500) label = 'major';
            else label = 'minor';
            resolve({ status: label, latency, httpCode: status });
            res.resume();
        });
        req.on('error', () => resolve({ status: 'offline', latency: Date.now() - start }));
        req.on('timeout', () => { req.destroy(); resolve({ status: 'offline', latency: timeoutMs }); });
        req.end();
    });
}

ipcMain.handle('get-steam-status', async () => {
    try {
        // Probe key Steam services in parallel
        const services = {
            'Steam Store': await probeService('store.steampowered.com'),
            'Community': await probeService('steamcommunity.com'),
            'Web API': await probeService('api.steampowered.com', '/ISteamWebAPIUtil/GetServerInfo/v1/'),
            'CDN (Akamai)': await probeService('cdn.akamai.steamstatic.com'),
            'CDN (Cloudflare)': await probeService('cdn.cloudflare.steamstatic.com'),
            'Help Site': await probeService('help.steampowered.com'),
            'Partner Network': await probeService('partner.steamgames.com')
        };
        
        const result = {};
        for (const name in services) {
            const s = services[name];
            const title = s.status === 'normal' ? `${s.latency}ms` : 
                         s.status === 'minor' ? `Slow (${s.latency}ms)` :
                         s.status === 'offline' ? 'Offline' : 'Issues';
            result[name] = { status: s.status, title, latency: s.latency };
        }
        
        return { success: true, services: result };
    } catch(e) {
        return { success: false, error: e.message };
    }
});

// ===== VRAM Optimizer =====
function getFolderSizeSync(dir) {
    let total = 0;
    try {
        const items = fs.readdirSync(dir, { withFileTypes: true });
        for (const it of items) {
            const p = path.join(dir, it.name);
            try {
                if (it.isDirectory()) {
                    total += getFolderSizeSync(p);
                } else {
                    total += fs.statSync(p).size;
                }
            } catch (e) {}
        }
    } catch (e) {}
    return total;
}

function deleteFolderContents(dir) {
    let deleted = 0;
    try {
        const items = fs.readdirSync(dir, { withFileTypes: true });
        for (const it of items) {
            const p = path.join(dir, it.name);
            try {
                if (it.isDirectory()) {
                    fs.rmSync(p, { recursive: true, force: true });
                } else {
                    fs.unlinkSync(p);
                }
                deleted++;
            } catch (e) {
                // File in use, skip
            }
        }
    } catch (e) {}
    return deleted;
}

ipcMain.handle('clear-shader-cache', async () => {
    const localAppData = process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local');
    
    // Candidate cache paths
    const cachePaths = [
        path.join(localAppData, 'NVIDIA', 'DXCache'),
        path.join(localAppData, 'NVIDIA', 'GLCache'),
        path.join(localAppData, 'NVIDIA', 'ComputeCache'),
        path.join(localAppData, 'NVIDIA', 'OptixCache'),
        path.join(localAppData, 'NVIDIA Corporation', 'NV_Cache'),
        path.join(localAppData, 'AMD', 'DxCache'),
        path.join(localAppData, 'AMD', 'GLCache'),
        path.join(localAppData, 'AMD', 'DxcCache'),
        path.join(localAppData, 'D3DSCache'),
        path.join(localAppData, 'Microsoft', 'DirectX Shader Cache')
    ];
    
    // Try to add Steam shader caches
    try {
        const steamPath = await new Promise((resolve) => {
            exec('reg query HKCU\\Software\\Valve\\Steam /v SteamPath', (err, stdout) => {
                if (err) return resolve(null);
                const m = stdout.match(/REG_SZ\s+(.+)/);
                resolve(m ? m[1].trim() : null);
            });
        });
        if (steamPath) {
            cachePaths.push(path.join(steamPath, 'appcache', 'shadercache'));
            cachePaths.push(path.join(steamPath, 'steamapps', 'shadercache'));
        }
    } catch (e) {}
    
    let totalFreedBytes = 0;
    let cleanedCount = 0;
    const cleanedPaths = [];
    
    for (const p of cachePaths) {
        if (fs.existsSync(p)) {
            const sizeBefore = getFolderSizeSync(p);
            if (sizeBefore > 0) {
                deleteFolderContents(p);
                const sizeAfter = getFolderSizeSync(p);
                const freed = sizeBefore - sizeAfter;
                if (freed > 0) {
                    totalFreedBytes += freed;
                    cleanedCount++;
                    cleanedPaths.push({ path: p, freed });
                }
            }
        }
    }
    
    return {
        success: true,
        freedBytes: totalFreedBytes,
        freedMB: (totalFreedBytes / (1024 * 1024)).toFixed(1),
        cleanedCount,
        paths: cleanedPaths
    };
});

ipcMain.handle('restart-gpu-driver', async () => {
    // Simulate Win + Ctrl + Shift + B (built-in Windows GPU driver reset hotkey)
    return new Promise((resolve) => {
        const psCommand = `
$sig = @'
[DllImport("user32.dll")]
public static extern void keybd_event(byte bVk, byte bScan, uint dwFlags, int dwExtraInfo);
'@
$kb = Add-Type -MemberDefinition $sig -Name KB -Namespace Win -PassThru
$kb::keybd_event(0x5B, 0, 0, 0)
$kb::keybd_event(0x11, 0, 0, 0)
$kb::keybd_event(0x10, 0, 0, 0)
$kb::keybd_event(0x42, 0, 0, 0)
Start-Sleep -Milliseconds 80
$kb::keybd_event(0x42, 0, 2, 0)
$kb::keybd_event(0x10, 0, 2, 0)
$kb::keybd_event(0x11, 0, 2, 0)
$kb::keybd_event(0x5B, 0, 2, 0)
`.trim();
        
        // Write to temp file and execute
        const tmpFile = path.join(os.tmpdir(), `nexus-gpu-reset-${Date.now()}.ps1`);
        try {
            fs.writeFileSync(tmpFile, psCommand);
            exec(`powershell -ExecutionPolicy Bypass -WindowStyle Hidden -File "${tmpFile}"`, (err) => {
                try { fs.unlinkSync(tmpFile); } catch (e) {}
                if (err) {
                    resolve({ success: false, error: err.message });
                } else {
                    resolve({ success: true });
                }
            });
        } catch (e) {
            resolve({ success: false, error: e.message });
        }
    });
});
