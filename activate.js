const fs = require('fs');
const path = require('path');
const os = require('os');
const { createLicense, getHardwareId, generateLicense } = require('./license');

// Hedef AppData klasörlerini bul (hem eski hem yeni versiyonlar için)
const appData = process.env.APPDATA || (process.platform === 'darwin' ? process.env.HOME + '/Library/Application Support' : process.env.HOME + '/.local/share');
const possibleFolders = [
    path.join(appData, 'Site Güvenlik'),
    path.join(appData, 'site-guvenlik')
];

let targetFolders = possibleFolders.filter(f => fs.existsSync(f));

console.log('--------------------------------------------------');
console.log('🛡️  AREM GUVENLIK - OTOMATIK LISANS SISTEMI');
console.log('--------------------------------------------------');

if (targetFolders.length === 0) {
    console.log('⚠️  UYARI: Program klasörü bulunamadı veya henüz oluşmamış.');
    console.log('Lütfen programı en az bir kez açıp hata aldıktan');
    console.log('sonra bu aracı tekrar çalıştırın.');
    
    // Eğer klasör yoksa biz oluşturalım (site-guvenlik olanı tercih edelim)
    const defaultFolder = path.join(appData, 'site-guvenlik');
    if (!fs.existsSync(defaultFolder)) fs.mkdirSync(defaultFolder, { recursive: true });
    targetFolders = [defaultFolder];
    console.log(`📂 Klasör oluşturuldu: ${defaultFolder}`);
}

try {
    const hwId = getHardwareId();
    const licenseKey = generateLicense(hwId);
    const crypto = require('crypto');
    
    const data = {
        license: licenseKey,
        hwHash: crypto.createHash('sha256').update(hwId).digest('hex'),
        created: new Date().toISOString(),
        version: '2.0',
        authorizedBy: 'FlashDrive-Master'
    };

    targetFolders.forEach(folder => {
        const licensePath = path.join(folder, '.license');
        fs.writeFileSync(licensePath, JSON.stringify(data, null, 2), 'utf8');
        console.log(`✅ BAŞARILI: Bu bilgisayar lisanslandı!`);
        console.log(`🆔 HWID: ${hwId.substring(0, 20)}...`);
        console.log(`🔑 Anahtar: ${licenseKey}`);
        console.log(`📍 Konum: ${licensePath}`);
    });

    console.log('\nArtık programı kullanmaya başlayabilirsiniz.');

} catch (err) {
    console.error('\n❌ Beklenmedik bir hata oluştu:', err.message);
}
console.log('--------------------------------------------------');
