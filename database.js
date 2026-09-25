const initSqlJs = require('sql.js');
const path = require('path');
const fs = require('fs');

// Koruma Kalkanı: Dinamik yol çözünürlüğü
function getDbPath() {
    const envPath = process.env.SITE_GUVENLIK_DB_PATH;
    if (envPath) return envPath;
    try {
        const { app } = require('electron');
        if (app) {
            return path.join(app.getPath('userData'), 'site-guvenlik.db');
        }
    } catch (e) {
    }
    return path.join(__dirname, 'site-guvenlik.db');
}

let BLOCK_CONFIG = null;

async function refreshBlockConfig() {
    try {
        const settings = await getSettings();
        if (settings.block_config) {
            BLOCK_CONFIG = JSON.parse(settings.block_config);
        } else {
            BLOCK_CONFIG = { 'A': 1, 'B': 1 };
        }
    } catch (e) {
        BLOCK_CONFIG = { 'A': 1 };
    }
}

let db = null;
let SQL = null;
let isInitialized = false;
let initPromise = null;

async function initialize() {
    if (initPromise) return initPromise;

    initPromise = (async () => {
        try {
            const currentDbPath = getDbPath();
            console.log(`📂 [Koruma Kalkanı] Veritabanı yükleniyor: ${currentDbPath}`);

            SQL = await initSqlJs({
                locateFile: file => {
                    const possiblePath = path.join(__dirname.replace('app.asar', 'app.asar.unpacked'), 'node_modules', 'sql.js', 'dist', file);
                    if (fs.existsSync(possiblePath)) return possiblePath;
                    return path.join(__dirname, 'node_modules', 'sql.js', 'dist', file);
                }
            });

            if (fs.existsSync(currentDbPath)) {
                const filebuffer = fs.readFileSync(currentDbPath);
                db = new SQL.Database(filebuffer);
                console.log("📖 Veritabanı dosyadan okundu.");
                createBackup(currentDbPath, filebuffer);
            } else {
                console.log("🆕 Yeni veritabanı oluşturuluyor...");
                db = new SQL.Database();
                saveToDisk();
            }

            setupDatabase();
            isInitialized = true;
            console.log("✅ sql.js (Wasm) başarıyla başlatıldı ve koruma kalkanı aktif.");
        } catch (err) {
            console.error("❌ Veritabanı başlatma hatası:", err);
            throw err;
        }
    })();

    return initPromise;
}

function createBackup(dbPath, buffer) {
    try {
        const backupPath = dbPath + '.bak';
        fs.writeFileSync(backupPath, buffer);
    } catch (err) {
        console.error("⚠️ Yedek oluşturulamadı:", err);
    }
}

function saveToDisk() {
    if (!db) return;
    try {
        const currentDbPath = getDbPath();
        const data = db.export();
        const buffer = Buffer.from(data);
        fs.writeFileSync(currentDbPath, buffer);
    } catch (err) {
        console.error("❌ Veritabanı kaydetme hatası:", err);
    }
}

function setupDatabase() {
    db.run(`
        CREATE TABLE IF NOT EXISTS residents (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          block TEXT NOT NULL,
          apartment_no INTEGER NOT NULL,
          name TEXT NOT NULL,
          phone TEXT NOT NULL,
          name2 TEXT,
          phone2 TEXT,
          name3 TEXT,
          phone3 TEXT,
          plaka TEXT,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          UNIQUE(block, apartment_no)
        )
    `);

    // Migration: residents kolonları
    const columns = db.exec("PRAGMA table_info(residents)")[0]?.values.map(v => v[1]) || [];
    if (!columns.includes('name2'))  db.run("ALTER TABLE residents ADD COLUMN name2 TEXT");
    if (!columns.includes('phone2')) db.run("ALTER TABLE residents ADD COLUMN phone2 TEXT");
    if (!columns.includes('name3'))  db.run("ALTER TABLE residents ADD COLUMN name3 TEXT");
    if (!columns.includes('phone3')) db.run("ALTER TABLE residents ADD COLUMN phone3 TEXT");
    if (!columns.includes('plaka')) {
        db.run("ALTER TABLE residents ADD COLUMN plaka TEXT");
        console.log("🚗 Veritabanı göçü: Plaka alanı eklendi.");
    }

    // Migration: eski blok CHECK constraint kaldır
    const schema = db.exec("SELECT sql FROM sqlite_master WHERE name='residents'")[0]?.values[0][0];
    if (schema && schema.includes("CHECK(block IN ('A', 'B', 'C', 'D'))")) {
        console.log("🛠️ [Göç] Residents tablosundaki eski blok sınırlaması kaldırılıyor...");
        db.run("ALTER TABLE residents RENAME TO residents_old");
        db.run(`
            CREATE TABLE residents (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              block TEXT NOT NULL,
              apartment_no INTEGER NOT NULL,
              name TEXT NOT NULL,
              phone TEXT NOT NULL,
              name2 TEXT,
              phone2 TEXT,
              name3 TEXT,
              phone3 TEXT,
              plaka TEXT,
              created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
              UNIQUE(block, apartment_no)
            )
        `);
        db.run("INSERT INTO residents SELECT id, block, apartment_no, name, phone, name2, phone2, name3, phone3, plaka, created_at FROM residents_old");
        db.run("DROP TABLE residents_old");
        console.log("✅ [Göç] Residents tablosu başarıyla güncellendi.");
    }

    // entry_logs tablosu
    db.run(`
        CREATE TABLE IF NOT EXISTS entry_logs (
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

    // Migration: entry_logs yeni kolonları ekle
    const logCols = db.exec("PRAGMA table_info(entry_logs)")[0]?.values.map(v => v[1]) || [];
    if (!logCols.includes('ack_status'))   db.run("ALTER TABLE entry_logs ADD COLUMN ack_status INTEGER DEFAULT 0");
    if (!logCols.includes('ack_status2'))  db.run("ALTER TABLE entry_logs ADD COLUMN ack_status2 INTEGER DEFAULT 0");
    if (!logCols.includes('ack_status3'))  db.run("ALTER TABLE entry_logs ADD COLUMN ack_status3 INTEGER DEFAULT 0");
    if (!logCols.includes('confirmed_by')) db.run("ALTER TABLE entry_logs ADD COLUMN confirmed_by TEXT DEFAULT NULL");

    // Mevcut NULL confirmation olan misafir kayıtlarını 'Bekliyor...' yap
    // (eski kayıtlar için geriye dönük düzeltme — yeni girişler zaten doğru gelecek)
    db.run(`
        UPDATE entry_logs
        SET confirmation = 'Bekliyor...'
        WHERE type = 'misafir'
        AND confirmation IS NULL
        AND timestamp >= datetime('now', '-24 hours', 'localtime')
    `);

    db.run(`
        CREATE TABLE IF NOT EXISTS incidents (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          olay_type TEXT NOT NULL,
          location TEXT NOT NULL,
          description TEXT NOT NULL,
          priority TEXT DEFAULT 'dusuk',
          timestamp DATETIME DEFAULT (datetime('now', 'localtime'))
        )
    `);

    db.run(`
        CREATE TABLE IF NOT EXISTS settings (
          key TEXT PRIMARY KEY,
          value TEXT
        )
    `);

    // Varsayılan ayarlar

    // Kurtarma mantığı
    const resCountRes = db.exec("SELECT COUNT(*) FROM residents");
    const resCount = (resCountRes && resCountRes[0]) ? resCountRes[0].values[0][0] : 0;

    const setupCompRes = db.exec("SELECT value FROM settings WHERE key = 'setup_complete'");
    const setupCompleteVal = (setupCompRes && setupCompRes[0]) ? setupCompRes[0].values[0][0] : '0';

    if (resCount > 0 && setupCompleteVal === '0') {
        console.log("🛠️ [Kurtarma] Mevcut sakinler bulundu, ayarlar otomatik yapılandırılıyor...");
        db.run("INSERT OR REPLACE INTO settings (key, value) VALUES ('setup_complete', '1')");

        const distinctBlocksRes = db.exec("SELECT DISTINCT block FROM residents");
        const distinctBlocks = (distinctBlocksRes && distinctBlocksRes[0]) ? distinctBlocksRes[0].values.flat() : [];

        const autoConfig = {};
        distinctBlocks.forEach(b => {
            const maxApRes = db.exec(`SELECT MAX(apartment_no) FROM residents WHERE block = '${b}'`);
            const maxAp = (maxApRes && maxApRes[0]) ? maxApRes[0].values[0][0] : 1;
            autoConfig[b] = maxAp;
        });

        if (Object.keys(autoConfig).length === 0) {
            autoConfig['A'] = 27; autoConfig['B'] = 27; autoConfig['C'] = 26; autoConfig['D'] = 26;
        }

        db.run("INSERT OR REPLACE INTO settings (key, value) VALUES ('block_config', ?)", [JSON.stringify(autoConfig)]);
        db.run("INSERT OR REPLACE INTO settings (key, value) VALUES ('site_name', 'Mevcut Site')");
        console.log("✅ [Kurtarma] Ayarlar başarıyla geri yüklendi.");
    } else if (!setupCompRes || !setupCompRes[0]) {
        db.run("INSERT INTO settings (key, value) VALUES ('setup_complete', '0')");
    }

    saveToDisk();
    refreshBlockConfig();
}

async function ensureReady() {
    await initialize();
    if (!db) throw new Error("Veritabanı hazır değil!");
}

// ==================== PROMISE HELPERS ====================

const run = async (query, params = []) => {
    await ensureReady();
    try {
        const isInsert = query.trim().toUpperCase().startsWith("INSERT");
        if (isInsert) {
            db.run(query, params);
            const res = db.exec("SELECT last_insert_rowid() AS id");
            const lastId = res[0].values[0][0];
            saveToDisk();
            return { lastInsertRowid: lastId, changes: 1 };
        } else {
            db.run(query, params);
            saveToDisk();
            return { lastInsertRowid: 0, changes: 1 };
        }
    } catch (e) {
        console.error(`❌ [DB Hata] Sorgu: ${query}`, e.message);
        throw e;
    }
};

const all = async (query, params = []) => {
    await ensureReady();
    const stmt = db.prepare(query);
    stmt.bind(params);
    const rows = [];
    while (stmt.step()) {
        rows.push(stmt.getAsObject());
    }
    stmt.free();
    return rows;
};

const get = async (query, params = []) => {
    await ensureReady();
    const stmt = db.prepare(query);
    stmt.bind(params);
    const row = stmt.step() ? stmt.getAsObject() : null;
    stmt.free();
    return row;
};

// Güvenli alan listesi — SQL injection koruması
const ALLOWED_LOG_FIELDS = new Set([
    'whatsapp_sent', 'whatsapp_sent2', 'whatsapp_sent3',
    'voice_sent', 'voice_sent2', 'voice_sent3',
    'ack_status', 'ack_status2', 'ack_status3',
    'confirmation', 'confirmed_by', 'visitor_name'
]);

// ==================== RESIDENT FONKSİYONLARI ====================

async function getAllResidents() {
    return all('SELECT * FROM residents ORDER BY block, apartment_no');
}

async function getResidentsByBlock(block) {
    return all('SELECT * FROM residents WHERE block = ? ORDER BY apartment_no', [block]);
}

async function getResident(block, apartment_no) {
    return get('SELECT * FROM residents WHERE block = ? AND apartment_no = ?', [block, apartment_no]);
}

async function addResident(block, apartment_no, name, phone, name2, phone2, name3, phone3, plaka) {
    return run(
        'INSERT INTO residents (block, apartment_no, name, phone, name2, phone2, name3, phone3, plaka) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
        [block, apartment_no, name, phone, name2 || null, phone2 || null, name3 || null, phone3 || null, plaka || null]
    );
}

async function updateResident(id, name, phone, name2, phone2, name3, phone3, plaka) {
    return run(
        'UPDATE residents SET name = ?, phone = ?, name2 = ?, phone2 = ?, name3 = ?, phone3 = ?, plaka = ? WHERE id = ?',
        [name, phone, name2 || null, phone2 || null, name3 || null, phone3 || null, plaka || null, id]
    );
}

async function deleteResident(id) {
    return run('DELETE FROM residents WHERE id = ?', [id]);
}

// ==================== LOG FONKSİYONLARI ====================

/**
 * Yeni giriş logu oluşturur.
 * DÜZELTİLDİ: Misafir girişlerinde confirmation = 'Bekliyor...' ile başlar.
 */
async function addEntryLog(type, block, apartment_no, resident_name, resident_phone, visitor_name, resident_name2, resident_phone2, resident_name3, resident_phone3) {
    // Sadece misafir girişlerinde onay beklenir
    const initialConfirmation = (type === 'misafir') ? 'Bekliyor...' : null;

    return run(
        'INSERT INTO entry_logs (type, block, apartment_no, resident_name, resident_phone, resident_name2, resident_phone2, resident_name3, resident_phone3, visitor_name, confirmation) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
        [type, block, apartment_no, resident_name, resident_phone, resident_name2 || null, resident_phone2 || null, resident_name3 || null, resident_phone3 || null, visitor_name || null, initialConfirmation]
    );
}

/**
 * Log kaydını günceller.
 * DÜZELTİLDİ: SQL injection koruması — sadece izin verilen alanlar güncellenir.
 */
async function updateEntryLog(id, updates) {
    const fields = [];
    const values = [];

    for (const [key, value] of Object.entries(updates)) {
        if (!ALLOWED_LOG_FIELDS.has(key)) {
            console.warn(`⚠️ [DB] updateEntryLog: izinsiz alan atlandı: "${key}"`);
            continue;
        }
        fields.push(`${key} = ?`);
        values.push(value);
    }

    if (fields.length === 0) {
        throw new Error('Güncellenecek geçerli alan bulunamadı.');
    }

    values.push(id);
    return run(`UPDATE entry_logs SET ${fields.join(', ')} WHERE id = ?`, values);
}

/**
 * Log listesini getirir.
 * DÜZELTİLDİ: "B1" veya "B-1" araması sadece o daireyi getirir (exact match).
 */
async function getEntryLogs(limit = 100, dateFilter = null, searchTerm = null, offset = 0) {
    let query = 'SELECT * FROM entry_logs WHERE 1=1';
    const params = [];

    if (dateFilter && !searchTerm) {
        query += ' AND date(timestamp) = ?';
        params.push(dateFilter);
    }

    if (searchTerm) {
        const term = searchTerm.trim();

        // Blok-Daire pattern tespiti: "B-1", "B1", "b 1", "b-10" vb.
        const blockAptPattern = /^([A-Da-d])[-\s]?(\d+)$/;
        const match = term.match(blockAptPattern);

        if (match) {
            // EXACT MATCH: sadece o blok ve o daire
            const block = match[1].toUpperCase();
            const aptNo = parseInt(match[2], 10);
            query += ' AND UPPER(block) = ? AND apartment_no = ?';
            params.push(block, aptNo);
        } else {
            // Genel arama: ad, ziyaretçi adı, blok
            const terms = term.split(/\s+/);
            terms.forEach((t, i) => {
                if (i > 0) query += ' AND';
                query += ` (
                    LOWER(COALESCE(resident_name, '')) LIKE LOWER(?) OR
                    LOWER(COALESCE(visitor_name, '')) LIKE LOWER(?) OR
                    LOWER(COALESCE(block, '')) LIKE LOWER(?)
                )`;
                const p = `%${t}%`;
                params.push(p, p, p);
            });
        }
    }

    query += ' ORDER BY timestamp DESC LIMIT ? OFFSET ?';
    params.push(limit, offset);

    return all(query, params);
}

/**
 * İstatistik sorgusu.
 * DÜZELTİLDİ: { byType: [...], total: N } formatında döner.
 */
async function getLogStats(dateFilter = null) {
    const params = [];
    let whereClause = '';

    if (dateFilter) {
        whereClause = 'WHERE date(timestamp) = ?';
        params.push(dateFilter);
    }

    const byType = await all(
        `SELECT type, COUNT(*) as count FROM entry_logs ${whereClause} GROUP BY type`,
        params
    );

    const totalRow = await get(
        `SELECT COUNT(*) as total FROM entry_logs ${whereClause}`,
        params
    );

    return {
        byType,
        total: totalRow ? totalRow.total : 0
    };
}

async function autoApproveEntries() {
    return run(`
        UPDATE entry_logs
        SET confirmation = 'OTOMATİK ONAY', confirmed_by = 'Sistem (Otomatik)'
        WHERE type = 'misafir'
        AND (confirmation IS NULL OR confirmation = 'Bekliyor...')
        AND timestamp <= datetime('now', '-3 hours', 'localtime')
    `);
}

async function getPendingConfirmations() {
    return all(`
        SELECT * FROM entry_logs
        WHERE type = 'misafir'
        AND confirmation = 'Bekliyor...'
        AND timestamp >= datetime('now', '-24 hours', 'localtime')
        ORDER BY timestamp DESC
    `);
}

async function getEntryLogById(id) {
    return get('SELECT * FROM entry_logs WHERE id = ?', [id]);
}

async function cleanupOldLogs() {
    console.log('🧹 Eski log temizliği (365 gün kuralı)...');
    return run(`
        DELETE FROM entry_logs
        WHERE timestamp < datetime('now', '-365 days', 'localtime')
    `);
}

// ==================== SETTINGS ====================

async function getSettings() {
    const rows = await all('SELECT * FROM settings');
    const settings = {};
    rows.forEach(r => settings[r.key] = r.value);
    return settings;
}

async function updateSetting(key, value) {
    return run('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)', [key, value.toString()]);
}

// ==================== OLAY/VAKA ====================

async function addIncident(olay_type, location, description, priority) {
    return run(
        'INSERT INTO incidents (olay_type, location, description, priority) VALUES (?, ?, ?, ?)',
        [olay_type, location, description, priority || 'dusuk']
    );
}

async function getIncidents(limit = 100) {
    return all('SELECT * FROM incidents ORDER BY timestamp DESC LIMIT ?', [limit]);
}

// ==================== SETUP ====================

async function getSetupStatus() {
    const settings = await getSettings();
    return settings.setup_complete === '1';
}

async function completeSetup(siteName, blockConfig, securityName, aptTypes, aptTypeNote) {
    await updateSetting('site_name', siteName);
    await updateSetting('block_config', JSON.stringify(blockConfig));
    if (securityName) await updateSetting('security_name', securityName);
    if (aptTypes) await updateSetting('apt_types', typeof aptTypes === 'string' ? aptTypes : JSON.stringify(aptTypes));
    if (aptTypeNote) await updateSetting('apt_type_note', aptTypeNote);
    await updateSetting('setup_complete', '1');
    await refreshBlockConfig();
    return true;
}

module.exports = {
    BLOCK_CONFIG: () => BLOCK_CONFIG,
    refreshBlockConfig,
    getSetupStatus,
    completeSetup,
    addResident,
    getAllResidents,
    getResidentsByBlock,
    getResident,
    updateResident,
    deleteResident,
    addEntryLog,
    getEntryLogs,
    getEntryLogById,
    getLogStats,
    getSettings,
    updateSetting,
    updateEntryLog,
    autoApproveEntries,
    cleanupOldLogs,
    addIncident,
    getIncidents,
    getPendingConfirmations,
    ALLOWED_LOG_FIELDS
};
