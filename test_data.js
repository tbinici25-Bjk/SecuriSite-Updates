const db = require('./database');

async function runTest() {
    try {
        console.log('--- Test Verisi Kaydı Başlatıldı ---');
        const result = await db.addResident('B', 2, 'MUSA KAVAL', '05357228321');
        console.log('✅ Sakin başarıyla kaydedildi! ID:', result.lastInsertRowid);

        const resident = await db.getResident('B', 4);
        console.log('🔍 Doğrulama:', resident);
    } catch (err) {
        console.error('❌ Hata:', err.message);
    } finally {
        process.exit();
    }
}

runTest();
