// fix_check.js — TEK SEFERLİK ÇALIŞTIRILACAK
// entry_logs tablosundaki type CHECK kısıtlamasını kaldırır.
// TÜM VERİLER KORUNUR. Çalıştıktan sonra bu dosya silinebilir.

const initSqlJs = require('sql.js');
const fs = require('fs');
const path = require('path');

// Veritabanı yolunu bul
function getDbPath() {
    const roaming = path.join(process.env.APPDATA || process.env.HOME || '', 'site-guvenlik', 'site-guvenlik.db');
    if (fs.existsSync(roaming)) return roaming;
    // Yedek konumlar
    const alt1 = path.join(__dirname, 'site-guvenlik.db');
    if (fs.existsSync(alt1)) return alt1;
    return roaming;
}

(async () => {
    try {
        const dbPath = getDbPath();
        console.log('📂 Veritabanı yolu:', dbPath);

        if (!fs.existsSync(dbPath)) {
            console.error('❌ Veritabanı bulunamadı:', dbPath);
            process.exit(1);
        }

        // YEDEK AL
        const backupPath = dbPath + '.check_fix_yedek_' + Date.now();
        fs.copyFileSync(dbPath, backupPath);
        console.log('✅ Yedek alındı:', backupPath);

        const SQL = await initSqlJs();
        const fileBuffer = fs.readFileSync(dbPath);
        const db = new SQL.Database(fileBuffer);

        // Mevcut tablo yapısını kontrol et
        const schemaResult = db.exec("SELECT sql FROM sqlite_master WHERE type='table' AND name='entry_logs'");
        const schema = schemaResult[0]?.values[0][0] || '';

        if (!schema.includes("type IN (")) {
            console.log('ℹ️ CHECK kısıtlaması zaten yok, işlem gerekmiyor.');
            process.exit(0);
        }

        console.log('🔧 CHECK kısıtlaması bulundu, kaldırılıyor...');

        // Kayıt sayısını al (doğrulama için)
        const countBefore = db.exec("SELECT COUNT(*) FROM entry_logs")[0]?.values[0][0] || 0;
        console.log('📊 Mevcut kayıt sayısı:', countBefore);

        // 1. Eski tabloyu yeniden adlandır
        db.run("ALTER TABLE entry_logs RENAME TO entry_logs_old");

        // 2. CHECK'siz yeni tablo oluştur (birebir aynı yapı)
        db.run(`
            CREATE TABLE entry_logs (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                type TEXT NOT NULL,
                block TEXT NOT NULL,
                apartment_no INTEGER NOT NULL,
                resident_name TEXT,
                resident_phone TEXT,
                resident_name2 TEXT,
                resident_phone2 TEXT,
                resident_name3 TEXT,
                resident_phone3 TEXT,
                visitor_name TEXT,
                whatsapp_sent INTEGER DEFAULT 0,
                whatsapp_sent2 INTEGER DEFAULT 0,
                whatsapp_sent3 INTEGER DEFAULT 0,
                voice_sent INTEGER DEFAULT 0,
                voice_sent2 INTEGER DEFAULT 0,
                voice_sent3 INTEGER DEFAULT 0,
                ack_status INTEGER DEFAULT 0,
                ack_status2 INTEGER DEFAULT 0,
                ack_status3 INTEGER DEFAULT 0,
                confirmation TEXT DEFAULT NULL,
                confirmed_by TEXT DEFAULT NULL,
                timestamp DATETIME DEFAULT (datetime('now', 'localtime'))
            )
        `);

        // 3. Ortak sütunları bul ve verileri kopyala
        const oldCols = db.exec("PRAGMA table_info(entry_logs_old)")[0]?.values.map(v => v[1]) || [];
        const newCols = ['id','type','block','apartment_no','resident_name','resident_phone','resident_name2','resident_phone2','resident_name3','resident_phone3','visitor_name','whatsapp_sent','whatsapp_sent2','whatsapp_sent3','voice_sent','voice_sent2','voice_sent3','ack_status','ack_status2','ack_status3','confirmation','confirmed_by','timestamp'];
        const sharedCols = newCols.filter(c => oldCols.includes(c));
        console.log('📋 Kopyalanacak sütunlar:', sharedCols.join(', '));

        db.run(`INSERT INTO entry_logs (${sharedCols.join(',')}) SELECT ${sharedCols.join(',')} FROM entry_logs_old`);

        // 4. Eski tabloyu sil
        db.run("DROP TABLE entry_logs_old");

        // Doğrulama
        const countAfter = db.exec("SELECT COUNT(*) FROM entry_logs")[0]?.values[0][0] || 0;
        console.log('📊 İşlem sonrası kayıt sayısı:', countAfter);

        if (countBefore !== countAfter) {
            console.error('❌ UYARI: Kayıt sayıları eşleşmiyor! İşlem geri alınıyor.');
            console.error('   Yedekten geri yükleyin:', backupPath);
            process.exit(1);
        }

        // 5. Diske kaydet
        const data = db.export();
        fs.writeFileSync(dbPath, Buffer.from(data));

        console.log('');
        console.log('✅✅✅ BAŞARILI! ✅✅✅');
        console.log('CHECK kısıtlaması kaldırıldı, tüm veriler korundu.');
        console.log('Artık eczane, temizlik gibi yeni tipler eklenebilir.');
        console.log('');
        console.log('Yedek dosyanız (gerekirse geri dönmek için):');
        console.log(backupPath);

        db.close();
        process.exit(0);

    } catch (err) {
        console.error('❌ HATA:', err.message);
        console.error('Veritabanınız değişmedi, güvende.');
        process.exit(1);
    }
})();
