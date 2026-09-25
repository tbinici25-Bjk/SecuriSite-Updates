const Database = require('better-sqlite3');
const db = new Database('D:\\SiteGuvenlik_Test\\resources\\app\\site-guvenlik.db');
const r = db.prepare("UPDATE entry_logs SET confirmation='OTOMATİK ONAY', confirmed_by='Sistem (Temizlendi)' WHERE confirmation='Bekliyor...'").run();
console.log('Temizlenen kayıt:', r.changes);
db.close();
