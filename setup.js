/**
 * İlk Çalışma Kurulum Scripti
 * ============================
 * Bu script, uygulamanın başka bir bilgisayarda ilk kez çalıştırılırken
 * eksik bağımlılıkları otomatik olarak tespit edip kurar.
 *
 * Kullanım: node setup.js
 *
 * Kontrol edilen bağımlılıklar:
 * 1. Node.js (çalışıyor olmalı — bu script zaten node ile çalıştığı için OK)
 * 2. NPM paketleri (node_modules)
 * 3. FFmpeg (sesli mesaj için gerekli)
 * 4. Lisans dosyası (bilgisayara özel)
 * 5. Chrome / Edge tarayıcı (WhatsApp Web için)
 */

const { execSync, spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');

const ROOT = __dirname;
const FFMPEG_DIR = path.join(ROOT, 'ffmpeg');

// ANSI renk kodları
const CYAN = '\x1b[36m';
const GREEN = '\x1b[32m';
const YELLOW = '\x1b[33m';
const RED = '\x1b[31m';
const RESET = '\x1b[0m';

function log(emoji, msg) {
    console.log(`${emoji} ${msg}`);
}

function logOK(msg) { log('✅', `${GREEN}${msg}${RESET}`); }
function logWarn(msg) { log('⚠️', `${YELLOW}${msg}${RESET}`); }
function logErr(msg) { log('❌', `${RED}${msg}${RESET}`); }
function logInfo(msg) { log('ℹ️', `${CYAN}${msg}${RESET}`); }

// ==================== 1. NODE.JS KONTROLÜ ====================

function checkNodeJS() {
    log('🔍', 'Node.js kontrol ediliyor...');
    try {
        const version = process.version;
        const major = parseInt(version.slice(1).split('.')[0]);
        if (major < 18) {
            logWarn(`Node.js ${version} — sürüm eski. Node.js 18+ önerilir.`);
            return false;
        }
        logOK(`Node.js ${version} OK`);
        return true;
    } catch (e) {
        logErr('Node.js kontrol edilemedi: ' + e.message);
        return false;
    }
}

// ==================== 2. NPM PAKETLERI ====================

function checkAndInstallPackages() {
    log('🔍', 'NPM paketleri kontrol ediliyor...');
    const nodeModulesPath = path.join(ROOT, 'node_modules');

    if (!fs.existsSync(nodeModulesPath)) {
        logWarn('node_modules bulunamadı. Paketler kuruluyor...');
        try {
            execSync('npm install --production', { cwd: ROOT, stdio: 'inherit' });
            logOK('NPM paketleri başarıyla kuruldu.');
            return true;
        } catch (e) {
            logErr('NPM paketleri kurulamadı: ' + e.message);
            return false;
        }
    }

    // Kritik paketleri kontrol et
    const requiredPackages = ['express', 'sqlite3', 'whatsapp-web.js', 'qrcode'];
    const missing = requiredPackages.filter(pkg => {
        try {
            require.resolve(pkg, { paths: [ROOT] });
            return false;
        } catch {
            return true;
        }
    });

    if (missing.length > 0) {
        logWarn(`Eksik paketler: ${missing.join(', ')}`);
        try {
            execSync('npm install --production', { cwd: ROOT, stdio: 'inherit' });
            logOK('Eksik paketler kuruldu.');
        } catch (e) {
            logErr('Paket kurulumu başarısız: ' + e.message);
            return false;
        }
    } else {
        logOK('Tüm NPM paketleri mevcut.');
    }
    return true;
}

// ==================== 3. FFMPEG ====================

function checkFFmpeg() {
    log('🔍', 'FFmpeg kontrol ediliyor...');

    // Sistem PATH'inde var mı?
    try {
        const result = execSync('ffmpeg -version', { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] });
        if (result.includes('ffmpeg version')) {
            logOK(`FFmpeg sistem PATH\'inde mevcut.`);
            return true;
        }
    } catch (e) {
        // Sistem PATH'inde yok
    }

    // Yerel klasörde var mı?
    const localFFmpeg = path.join(FFMPEG_DIR, 'ffmpeg.exe');
    if (fs.existsSync(localFFmpeg)) {
        logOK('FFmpeg yerel klasörde mevcut.');
        return true;
    }

    // FFmpeg yok — kullanıcıyı bilgilendir
    logWarn('FFmpeg bulunamadı. Sesli mesaj gönderimi çalışmayabilir.');
    logInfo('FFmpeg kurmak için: winget install Gyan.FFmpeg');
    logInfo('Veya https://www.gyan.dev/ffmpeg/builds/ adresinden indirin.');
    logInfo('İndirilen ffmpeg.exe dosyasını bu klasördeki "ffmpeg" alt klasörüne koyun.');

    // Otomatik indirme dene
    return downloadFFmpeg();
}

function downloadFFmpeg() {
    logInfo('FFmpeg otomatik indiriliyor...');

    try {
        // winget ile dene
        execSync('winget install Gyan.FFmpeg --accept-package-agreements --accept-source-agreements', {
            stdio: 'inherit',
            timeout: 120000
        });
        logOK('FFmpeg winget ile başarıyla kuruldu!');
        return true;
    } catch (e) {
        logWarn('winget ile kurulamadı, alternatif yol deneniyor...');
    }

    // Winget başarısız — basit indir
    try {
        if (!fs.existsSync(FFMPEG_DIR)) {
            fs.mkdirSync(FFMPEG_DIR, { recursive: true });
        }
        logWarn('FFmpeg otomatik indirilemedi. Manuel kurulum gerekebilir.');
        logInfo('1. https://www.gyan.dev/ffmpeg/builds/ adresine gidin');
        logInfo('2. "ffmpeg-release-essentials.zip" indirin');
        logInfo('3. İçindeki "ffmpeg.exe" dosyasını şu klasöre koyun:');
        logInfo(`   ${FFMPEG_DIR}`);
        return false;
    } catch (e) {
        logErr('FFmpeg dizini oluşturulamadı: ' + e.message);
        return false;
    }
}

// ==================== 4. LİSANS ====================

function checkLicense() {
    log('🔍', 'Lisans kontrol ediliyor...');
    const { verifyLicense, createLicense } = require('./license');

    if (verifyLicense()) {
        logOK('Lisans geçerli.');
        return true;
    }

    logWarn('Lisans bulunamadı veya geçersiz. Yeni lisans oluşturuluyor...');
    try {
        createLicense();
        if (verifyLicense()) {
            logOK('Yeni lisans başarıyla oluşturuldu!');
            return true;
        }
    } catch (e) {
        logErr('Lisans oluşturulamadı: ' + e.message);
    }
    return false;
}

// ==================== 5. TARAYICI ====================

function checkBrowser() {
    log('🔍', 'Tarayıcı kontrol ediliyor (WhatsApp Web için)...');
    const paths = [
        'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
        'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
        path.join(process.env.LOCALAPPDATA || '', 'Google\\Chrome\\Application\\chrome.exe'),
        'C:\\Program Files\\Opera\\launcher.exe',
        'C:\\Program Files (x86)\\Opera\\launcher.exe',
        path.join(process.env.LOCALAPPDATA || '', 'Programs\\Opera\\launcher.exe'),
        'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
        'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe'
    ];

    for (const p of paths) {
        if (fs.existsSync(p)) {
            logOK(`Tarayıcı bulundu: ${path.basename(p)}`);
            return true;
        }
    }

    logWarn('Chrome, Opera veya Edge bulunamadı. WhatsApp bağlantısı sorunlu olabilir.');
    logInfo('Google Chrome veya Microsoft Edge kurmanız önerilir.');
    return false;
}

// ==================== 6. VERİTABANI DOSYASI ====================

function checkDatabase() {
    log('🔍', 'Veritabanı kontrol ediliyor...');
    const dbPath = path.join(ROOT, 'site-guvenlik.db');

    if (fs.existsSync(dbPath)) {
        const stats = fs.statSync(dbPath);
        logOK(`Veritabanı mevcut (${(stats.size / 1024).toFixed(1)} KB)`);
        return true;
    }

    logInfo('Veritabanı bulunamadı — ilk çalışmada otomatik oluşturulacak.');
    return true;
}

// ==================== ANA KURULUM ====================

async function runSetup() {
    console.log('\n' + '═'.repeat(55));
    console.log('  🛡️  SITE GÜVENLİK — OTOMATİK KURULUM SİSTEMİ');
    console.log('═'.repeat(55) + '\n');

    const results = {
        nodejs: checkNodeJS(),
        packages: checkAndInstallPackages(),
        ffmpeg: checkFFmpeg(),
        license: checkLicense(),
        browser: checkBrowser(),
        database: checkDatabase()
    };

    console.log('\n' + '─'.repeat(55));
    console.log('  📊 KURULUM ÖZETİ');
    console.log('─'.repeat(55));
    console.log(`  Node.js        : ${results.nodejs ? '✅ OK' : '❌ HATA'}`);
    console.log(`  NPM Paketleri  : ${results.packages ? '✅ OK' : '❌ HATA'}`);
    console.log(`  FFmpeg          : ${results.ffmpeg ? '✅ OK' : '⚠️ Eksik (opsiyonel)'}`);
    console.log(`  Lisans          : ${results.license ? '✅ OK' : '❌ HATA'}`);
    console.log(`  Tarayıcı        : ${results.browser ? '✅ OK' : '⚠️ Eksik'}`);
    console.log(`  Veritabanı      : ${results.database ? '✅ OK' : 'ℹ️ Oluşturulacak'}`);
    console.log('─'.repeat(55));

    const critical = results.nodejs && results.packages && results.license;

    if (critical) {
        logOK('\n🎉 Kurulum tamamlandı! Uygulama başlatılabilir.\n');
        logInfo('Başlatmak için: npx electron . veya baslat-electron.bat\n');
    } else {
        logErr('\n⛔ Kritik bağımlılıklar eksik. Uygulama başlatılamaz.');
        logInfo('Yukarıdaki hataları çözün ve setup.js\'yi tekrar çalıştırın.\n');
        process.exit(1);
    }
}

// Script olarak çalıştırıldıysa
if (require.main === module) {
    runSetup().catch(console.error);
}

module.exports = { runSetup, checkFFmpeg, checkBrowser, checkLicense };
