const { app, BrowserWindow, Menu, Tray, dialog, shell } = require('electron');
const path = require('path');
const fs = require('fs');

// Tek örnek kilidi — aynı anda birden fazla pencere açılmasını engelle
const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
    app.quit();
    process.exit(0);
}

let mainWindow = null;
let tray = null;
let serverInstance = null;
let serverPort = 3005;

// ==================== ORTAM AYARLARI ====================

function setupFFmpeg() {
    const possiblePaths = [
        path.join(getResourcesPath(), 'ffmpeg', 'ffmpeg.exe'),
        'C:\\Users\\tarik\\AppData\\Local\\Microsoft\\WinGet\\Packages\\Gyan.FFmpeg_Microsoft.Winget.Source_8wekyb3d8bbwe\\ffmpeg-8.1-full_build\\bin',
        'C:\\ffmpeg\\bin',
        path.join(process.env.LOCALAPPDATA || '', 'ffmpeg', 'bin'),
    ];
    for (const ffmpegPath of possiblePaths) {
        if (fs.existsSync(ffmpegPath) || fs.existsSync(path.join(ffmpegPath, 'ffmpeg.exe'))) {
            const binPath = ffmpegPath.endsWith('.exe') ? path.dirname(ffmpegPath) : ffmpegPath;
            if (!process.env.PATH.includes(binPath)) {
                process.env.PATH = binPath + ';' + process.env.PATH;
            }
            console.log(`🎬 FFmpeg bulundu: ${binPath}`);
            return true;
        }
    }
    console.warn('⚠️ FFmpeg bulunamadı — sesli mesaj gönderimi çalışmayabilir.');
    return false;
}

function getResourcesPath() {
    if (app.isPackaged) return process.resourcesPath;
    return path.join(__dirname);
}

function getDbPath() {
    if (app.isPackaged) {
        return path.join(app.getPath('userData'), 'site-guvenlik.db');
    }
    return path.join(__dirname, 'site-guvenlik.db');
}

function getAuthPath() {
    if (app.isPackaged) {
        return path.join(app.getPath('userData'), '.wwebjs_auth');
    }
    return path.join(__dirname, '.wwebjs_auth_electron');
}

// ==================== MASAÜSTÜ KISAYOLU ====================

function createDesktopShortcut() {
    try {
        const desktopPath = app.getPath('desktop');
        const exePath = process.execPath;
        const shortcutPath = path.join(desktopPath, 'Site Güvenlik.lnk');
        const iconPath = path.join(__dirname, 'assets', 'icon.ico');

        const result = shell.writeShortcutLink(shortcutPath, 'create', {
            target: exePath,
            name: 'Site Güvenlik',
            description: 'Site Güvenlik Yönetim Sistemi',
            icon: fs.existsSync(iconPath) ? iconPath : exePath,
            iconIndex: 0
        });

        if (result) {
            console.log(`✅ [Kısayol] Masaüstü kısayolu oluşturuldu: ${shortcutPath}`);
            return { success: true, path: shortcutPath };
        } else {
            console.warn('⚠️ [Kısayol] shell.writeShortcutLink başarısız, PowerShell deneniyor...');
            return createShortcutViaPowerShell(desktopPath, exePath, iconPath);
        }
    } catch (err) {
        console.error('❌ [Kısayol] Hata:', err.message);
        return { success: false, error: err.message };
    }
}

function createShortcutViaPowerShell(desktopPath, exePath, iconPath) {
    try {
        const { execSync } = require('child_process');
        const shortcutPath = path.join(desktopPath, 'Site Güvenlik.lnk');
        const iconArg = fs.existsSync(iconPath) ? iconPath : exePath;

        const psScript = `
            $WshShell = New-Object -ComObject WScript.Shell
            $Shortcut = $WshShell.CreateShortcut("${shortcutPath.replace(/\\/g, '\\\\')}")
            $Shortcut.TargetPath = "${exePath.replace(/\\/g, '\\\\')}"
            $Shortcut.IconLocation = "${iconArg.replace(/\\/g, '\\\\')}"
            $Shortcut.Description = "Site Güvenlik Yönetim Sistemi"
            $Shortcut.Save()
        `.trim();

        execSync(`powershell -NoProfile -Command "${psScript.replace(/\n\s+/g, '; ')}"`, {
            timeout: 10000,
            windowsHide: true
        });

        console.log(`✅ [Kısayol] PowerShell ile oluşturuldu: ${shortcutPath}`);
        return { success: true, path: shortcutPath };
    } catch (err) {
        console.error('❌ [Kısayol] PowerShell hatası:', err.message);
        return { success: false, error: err.message };
    }
}

// ==================== LİSANS KONTROLÜ ====================

function checkLicense() {
    try {
        const { verifyLicense } = require('./license');
        if (!verifyLicense()) {
            dialog.showMessageBoxSync({
                type: 'error',
                title: 'Lisans Hatası!',
                message: '❌ Bu yazılım bu bilgisayar için yetkilendirilmemiş (Donanım Kimliği Eşleşmiyor).\n\nLütfen flash bellekteki Lisanla.bat dosyasını kullanarak bu cihazı yetkilendirin.',
                buttons: ['Tamam']
            });
            return false;
        }
        return true;
    } catch (err) {
        console.error('Lisans kontrol hatası:', err);
        return false;
    }
}

// ==================== WHATSAPP KİLİT TEMİZLEME ====================

function clearWhatsAppLocks() {
    try {
        const { execSync } = require('child_process');

        console.log('💀 [main] Zombi chrome süreçleri aranıyor...');
        try {
            const psCmd = `Get-CimInstance Win32_Process -Filter "name='chrome.exe'" -ErrorAction SilentlyContinue | Where-Object { $_.CommandLine -match 'wwebjs_auth|headless|site-guvenlik' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }`;
            execSync(`powershell -NoProfile -Command "${psCmd}"`, {
                timeout: 15000, windowsHide: true, stdio: 'ignore'
            });
        } catch(e) {}

        console.log('⏳ [main] Kilit dosyaları temizleniyor...');
        try {
            execSync('ping -n 4 127.0.0.1 > nul', { timeout: 8000, windowsHide: true, stdio: 'ignore' });
        } catch(e) {}

        const authPaths = [
            path.join(app.getPath('userData'), '.wwebjs_auth'),
            path.join(app.getPath('userData'), '.wwebjs_auth_electron'),
            path.join(__dirname, '.wwebjs_auth'),
            path.join(__dirname, '.wwebjs_auth_electron')
        ];

        const killFiles = [
            'SingletonLock', 'SingletonCookie', 'SingletonSocket',
            'lockfile', 'DevToolsActivePort'
        ];

        const skipDirs = ['Cache', 'Code Cache', 'GPUCache', 'ShaderCache',
            'GrShaderCache', 'GraphiteDawnCache', 'DawnCache', 'blob_storage'];

        function sweep(dirPath, depth) {
            if (depth > 5 || !fs.existsSync(dirPath)) return;
            try {
                const entries = fs.readdirSync(dirPath, { withFileTypes: true });
                for (const entry of entries) {
                    const full = path.join(dirPath, entry.name);
                    if (entry.isDirectory() && !skipDirs.includes(entry.name)) {
                        sweep(full, depth + 1);
                    } else if (killFiles.includes(entry.name)) {
                        try { fs.unlinkSync(full); } catch(e) {
                            try {
                                execSync(`cmd /c "del /f /q "${full}""`, {
                                    timeout: 5000, windowsHide: true, stdio: 'ignore'
                                });
                            } catch(e2) {}
                        }
                        console.log('🔓 [main] Silindi:', full);
                    }
                }
            } catch(e) {}
        }

        authPaths.forEach(ap => sweep(ap, 0));

        try {
            const rootLock = path.join(app.getPath('userData'), 'lockfile');
            if (fs.existsSync(rootLock)) {
                try { fs.unlinkSync(rootLock); } catch(e) {
                    execSync(`cmd /c "del /f /q "${rootLock}""`, {
                        timeout: 5000, windowsHide: true, stdio: 'ignore'
                    });
                }
                console.log('🔓 [main] Root lockfile silindi.');
            }
        } catch(e) {}

        console.log('✅ [main] WhatsApp kilitleri temizlendi.');
    } catch(e) {
        console.error('Kilit temizleme hatası:', e.message);
    }
}

// ==================== SERVER BAŞLAT ====================

function startServer() {
    return new Promise((resolve, reject) => {
        try {
            process.env.SITE_GUVENLIK_DB_PATH = getDbPath();
            process.env.SITE_GUVENLIK_AUTH_PATH = getAuthPath();

            if (app.isPackaged) {
                const targetDb = getDbPath();
                const sourceDb = path.join(getResourcesPath(), 'app', 'site-guvenlik.db');
                if (!fs.existsSync(targetDb) && fs.existsSync(sourceDb)) {
                    fs.copyFileSync(sourceDb, targetDb);
                    console.log('📂 Veritabanı userData klasörüne kopyalandı.');
                }
            }

            const { startServer: startExpressServer } = require('./server');
            serverInstance = startExpressServer(serverPort, (actualPort) => {
                serverPort = actualPort;
                console.log(`🏢 Express sunucu başlatıldı: http://localhost:${serverPort}`);
                resolve(serverPort);
            });
        } catch (err) {
            console.error('Server başlatma hatası:', err);
            reject(err);
        }
    });
}

// ==================== PENCERE OLUŞTUR ====================

function createWindow() {
    mainWindow = new BrowserWindow({
        width: 1280,
        height: 800,
        minWidth: 900,
        minHeight: 600,
        title: 'Site Güvenlik Yönetim Sistemi',
        icon: path.join(__dirname, 'assets', 'icon.ico'),
        autoHideMenuBar: true,
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true
        },
        show: false
    });

    mainWindow.once('ready-to-show', () => {
        mainWindow.show();
        mainWindow.focus();
    });

    mainWindow.loadURL(`http://localhost:${serverPort}`);

    mainWindow.webContents.setWindowOpenHandler(({ url }) => {
        shell.openExternal(url);
        return { action: 'deny' };
    });

    mainWindow.on('close', (event) => {
        if (!app.isQuitting) {
            event.preventDefault();
            mainWindow.hide();
            if (tray) {
                tray.displayBalloon({
                    title: 'Site Güvenlik',
                    content: 'Uygulama arka planda çalışıyor. WhatsApp bildirimleri aktif.',
                    iconType: 'info'
                });
            }
        }
    });

    mainWindow.on('closed', () => { mainWindow = null; });
}

// ==================== TRAY MENU ====================

function createTray() {
    const iconPath = path.join(__dirname, 'assets', 'icon.ico');
    const trayIcon = fs.existsSync(iconPath) ? iconPath : path.join(__dirname, 'assets', 'icon.png');

    try {
        tray = new Tray(trayIcon);
    } catch (e) {
        console.warn('⚠️ Tray ikonu bulunamadı.');
        return;
    }

    const contextMenu = Menu.buildFromTemplate([
        {
            label: '🏢 Aç — Site Güvenlik',
            click: () => {
                if (mainWindow) { mainWindow.show(); mainWindow.focus(); }
                else createWindow();
            }
        },
        {
            label: '📋 Yönetim Paneli',
            click: () => {
                if (mainWindow) {
                    mainWindow.loadURL(`http://localhost:${serverPort}/admin.html`);
                    mainWindow.show(); mainWindow.focus();
                }
            }
        },
        {
            label: '📊 Giriş Logları',
            click: () => {
                if (mainWindow) {
                    mainWindow.loadURL(`http://localhost:${serverPort}/logs.html`);
                    mainWindow.show(); mainWindow.focus();
                }
            }
        },
        { type: 'separator' },
        {
            label: '📱 WhatsApp Bağlantı',
            click: () => {
                if (mainWindow) {
                    mainWindow.loadURL(`http://localhost:${serverPort}/whatsapp.html`);
                    mainWindow.show(); mainWindow.focus();
                }
            }
        },
        { type: 'separator' },
        {
            label: '🖥️ Masaüstü Kısayolu Oluştur',
            click: () => {
                const result = createDesktopShortcut();
                dialog.showMessageBoxSync({
                    type: result.success ? 'info' : 'warning',
                    title: result.success ? 'Kısayol Oluşturuldu' : 'Kısayol Oluşturulamadı',
                    message: result.success
                        ? '✅ Masaüstünde "Site Güvenlik" kısayolu oluşturuldu.'
                        : `⚠️ Kısayol oluşturulamadı: ${result.error}`,
                    buttons: ['Tamam']
                });
            }
        },
        { type: 'separator' },
        {
            label: '❌ Tamamen Kapat',
            click: () => {
                app.isQuitting = true;
                if (tray) tray.destroy();
                app.quit();
            }
        }
    ]);

    tray.setToolTip('Site Güvenlik Yönetim Sistemi');
    tray.setContextMenu(contextMenu);

    tray.on('click', () => {
        if (mainWindow) {
            if (mainWindow.isVisible()) mainWindow.focus();
            else { mainWindow.show(); mainWindow.focus(); }
        } else {
            createWindow();
        }
    });
}

// ==================== UYGULAMA BAŞLATMA ====================

app.on('ready', async () => {
    console.log('🚀 Site Güvenlik Electron uygulaması başlatılıyor...');

    setupFFmpeg();
    clearWhatsAppLocks();

    if (!checkLicense()) {
        app.quit();
        return;
    }

    try {
        await startServer();
    } catch (err) {
        dialog.showMessageBoxSync({
            type: 'error',
            title: 'Sunucu Hatası',
            message: `Express sunucusu başlatılamadı:\n${err.message}\n\nPort ${serverPort} başka bir uygulama tarafından kullanılıyor olabilir.`
        });
        app.quit();
        return;
    }

    createTray();

    // ==================== OTOMATİK YEDEKLEME ====================
    function otomatikYedekle() {
        try {
            const kaynak = [
                'C:\\Users\\tarik\\AppData\\Roaming\\site-guvenlik\\site-guvenlik.db',
                'D:\\SiteGuvenlik_Test\\resources\\app\\site-guvenlik.db'
            ];
            const hedefKlasor = 'D:\\Backups\\Site Yedekleri';

            if (!fs.existsSync(hedefKlasor)) {
                fs.mkdirSync(hedefKlasor, { recursive: true });
            }

            const tarih = new Date().toISOString().slice(0, 10);

            kaynak.forEach(db => {
                if (fs.existsSync(db)) {
                    const hedef = path.join(hedefKlasor, `site-guvenlik_${tarih}.db`);
                    fs.copyFileSync(db, hedef);
                    console.log(`✅ Yedek alındı: ${hedef}`);
                }
            });
        } catch(e) {
            console.error('❌ Yedekleme hatası:', e.message);
        }
    }

    const simdi = new Date();
    const yarin = new Date(simdi);
    yarin.setDate(yarin.getDate() + 1);
    yarin.setHours(3, 0, 0, 0);
    const ilkBekleme = yarin - simdi;

    setTimeout(() => {
        otomatikYedekle();
        setInterval(otomatikYedekle, 24 * 60 * 60 * 1000);
    }, ilkBekleme);

    otomatikYedekle();

    createWindow();
});

app.on('second-instance', () => {
    if (mainWindow) {
        if (mainWindow.isMinimized()) mainWindow.restore();
        mainWindow.show();
        mainWindow.focus();
    }
});

app.on('window-all-closed', () => { });
app.on('before-quit', () => { app.isQuitting = true; });
app.on('activate', () => { if (mainWindow === null) createWindow(); });

process.on('SIGINT',  () => { app.isQuitting = true; app.quit(); });
process.on('SIGTERM', () => { app.isQuitting = true; app.quit(); });

// ==================== IPC: KISAYOL API ====================
global.createDesktopShortcut = createDesktopShortcut;