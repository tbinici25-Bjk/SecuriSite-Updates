const crypto = require('crypto');
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

let LICENSE_FOLDER = __dirname;
// Electron ortamındaysak userData klasörünü kullan
try {
    const { app } = require('electron');
    if (app) LICENSE_FOLDER = app.getPath('userData');
} catch (e) {
    // Electron yüklü değilse (activation script gibi) mevcut klasörü kullan
}

const LICENSE_FILE = path.join(LICENSE_FOLDER, '.license');
const SECRET_KEY = 'AremGuvenlik2026!SiteKoruma';

// Bilgisayarın donanım parmak izini al
function getHardwareId() {
    try {
        // Anakart seri numarası
        const mbSerial = execSync('wmic baseboard get serialnumber', { encoding: 'utf8' })
            .split('\n').filter(l => l.trim() && !l.includes('SerialNumber'))[0]?.trim() || 'UNKNOWN_MB';

        // CPU kimliği
        const cpuId = execSync('wmic cpu get processorid', { encoding: 'utf8' })
            .split('\n').filter(l => l.trim() && !l.includes('ProcessorId'))[0]?.trim() || 'UNKNOWN_CPU';

        // BIOS seri numarası
        const biosSerial = execSync('wmic bios get serialnumber', { encoding: 'utf8' })
            .split('\n').filter(l => l.trim() && !l.includes('SerialNumber'))[0]?.trim() || 'UNKNOWN_BIOS';

        return `${mbSerial}|${cpuId}|${biosSerial}`;
    } catch (e) {
        // Fallback: MAC adresi + hostname
        const os = require('os');
        const interfaces = os.networkInterfaces();
        let mac = 'UNKNOWN_MAC';
        for (const iface of Object.values(interfaces)) {
            for (const alias of iface) {
                if (!alias.internal && alias.mac !== '00:00:00:00:00:00') {
                    mac = alias.mac;
                    break;
                }
            }
        }
        return `${mac}|${os.hostname()}|FALLBACK`;
    }
}

// Donanım ID'den lisans anahtarı üret
function generateLicense(hardwareId) {
    const hash = crypto.createHmac('sha256', SECRET_KEY)
        .update(hardwareId)
        .digest('hex');
    // İlk 32 karakter al, 8'li gruplara böl
    return hash.substring(0, 32).toUpperCase().match(/.{8}/g).join('-');
}

// Lisans dosyası oluştur
function createLicense() {
    const hwId = getHardwareId();
    const license = generateLicense(hwId);
    const data = {
        license: license,
        hwHash: crypto.createHash('sha256').update(hwId).digest('hex'),
        created: new Date().toISOString(),
        version: '1.0'
    };
    fs.writeFileSync(LICENSE_FILE, JSON.stringify(data, null, 2), 'utf8');
    console.log(`🔑 Lisans oluşturuldu: ${license}`);
    return true;
}

// Lisansı doğrula
function verifyLicense() {
    // Lisans dosyası var mı?
    if (!fs.existsSync(LICENSE_FILE)) {
        console.error('❌ Lisans dosyası bulunamadı!');
        console.error('   Bu yazılım yetkisiz bir kopya olabilir.');
        console.error('   Lütfen yetkili kişiyle iletişime geçin.');
        return false;
    }

    try {
        const data = JSON.parse(fs.readFileSync(LICENSE_FILE, 'utf8'));
        const currentHwId = getHardwareId();
        const currentHwHash = crypto.createHash('sha256').update(currentHwId).digest('hex');
        const expectedLicense = generateLicense(currentHwId);

        // Donanım eşleşiyor mu?
        if (data.hwHash !== currentHwHash) {
            console.error('❌ LISANS HATASI: Bu yazılım bu bilgisayar için yetkilendirilmemiş!');
            console.error('   Dosyalar başka bir bilgisayardan kopyalanmış olabilir.');
            console.error('   Lütfen yetkili kişiyle iletişime geçin.');
            return false;
        }

        // Lisans anahtarı doğru mu?
        if (data.license !== expectedLicense) {
            console.error('❌ LISANS HATASI: Lisans anahtarı geçersiz!');
            console.error('   Lisans dosyası değiştirilmiş olabilir.');
            return false;
        }

        console.log(`🔑 Lisans doğrulandı: ${data.license.substring(0, 8)}...`);
        return true;
    } catch (e) {
        console.error('❌ Lisans dosyası okunamadı:', e.message);
        return false;
    }
}

module.exports = { createLicense, verifyLicense, getHardwareId, generateLicense };
