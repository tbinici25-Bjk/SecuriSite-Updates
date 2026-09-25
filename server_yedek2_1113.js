if (typeof crypto === 'undefined') { global.crypto = require('crypto').webcrypto; }
process.env.PATH = "C:\\Users\\tarik\\AppData\\Local\\Microsoft\\WinGet\\Packages\\Gyan.FFmpeg_Microsoft.Winget.Source_8wekyb3d8bbwe\\ffmpeg-8.1-full_build\\bin;" + process.env.PATH;

const express = require('express');
const path = require('path');
const fs = require('fs');
const db = require('./database');
const wa = require('./whatsapp');
let tts = null;
try {
    tts = require('./tts');
    console.log('🎤 [TTS] Profesyonel ses modülü yüklendi.');
} catch (ttsErr) {
    console.error('⚠️ [TTS] Ses modülü yüklenemedi:', ttsErr.message);
    tts = { generateEntryVoice: async () => null, getGreeting: () => 'iyi günler diler', createSpeechText: () => '' };
}
const { verifyLicense } = require('./license');

if (require.main === module) {
  if (!verifyLicense()) {
    console.error('\n🚫 Bu yazılım bu bilgisayarda çalıştırılamaz.\n');
    process.exit(1);
  }
}

const app = express();
const PORT = 3000;

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ==================== SETUP MIDDLEWARE ====================

const checkSetup = async (req, res, next) => {
  if (
    req.path.includes("/api/setup") ||
    req.path.includes("/setup.html") ||
    req.path.includes("/assets/") ||
    req.path.startsWith("/api/whatsapp/status") ||
    req.path.startsWith("/api/assistant")
  ) { return next(); }
  try {
    const isSetupComplete = await db.getSetupStatus();
    console.log('🔍 [checkSetup] path=' + req.path + ' setupComplete=' + isSetupComplete);
    if (!isSetupComplete) return res.redirect("/setup.html");
    next();
  } catch(e) {
    // DB henüz hazır değilse veya hata varsa, güvenli tarafta kal:
    // API isteklerini engelleme, ama sayfa isteklerini setup'a yönlendir
    if (req.path.startsWith('/api/')) return next();
    return res.redirect("/setup.html");
  }
};
app.use(checkSetup);

// ==================== OLAY/VAKA API ====================

app.post('/api/incident', async (req, res) => {
  try {
    const { olay_type, location, description, priority } = req.body;
    if (!olay_type || !location || !description)
      return res.status(400).json({ error: 'Olay tipi, konum ve açıklama gereklidir' });
    await db.addIncident(olay_type, location, description, priority || 'dusuk');
    res.json({ success: true, message: 'Olay kaydedildi' });
  } catch(err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/incidents', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 100;
    res.json(await db.getIncidents(limit));
  } catch(err) { res.status(500).json({ error: err.message }); }
});

// ==================== RESIDENT API ====================

app.get('/api/residents', async (req, res) => {
  try {
    const { block } = req.query;
    res.json(block ? await db.getResidentsByBlock(block) : await db.getAllResidents());
  } catch(err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/blocks', (req, res) => res.json(db.BLOCK_CONFIG()));

app.post('/api/residents', async (req, res) => {
  const { block, apartment_no, name, phone, name2, phone2, name3, phone3, plaka } = req.body;
  if (!block || !apartment_no || !name || !phone)
    return res.status(400).json({ error: 'Tüm alanlar zorunludur' });
  try {
    const result = await db.addResident(block, parseInt(apartment_no), name, phone, name2, phone2, name3, phone3, plaka);
    res.json({ success: true, id: result.lastInsertRowid });
  } catch(err) {
    if (err.message.includes('UNIQUE'))
      return res.status(400).json({ error: 'Bu blok ve daire numarası zaten kayıtlı' });
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/residents/:id', async (req, res) => {
  const { name, phone, name2, phone2, name3, phone3, plaka } = req.body;
  if (!name || !phone) return res.status(400).json({ error: 'Ad ve telefon zorunludur' });
  try {
    await db.updateResident(parseInt(req.params.id), name, phone, name2, phone2, name3, phone3, plaka);
    res.json({ success: true });
  } catch(err) { res.status(500).json({ error: err.message }); }
});

app.delete('/api/residents/:id', async (req, res) => {
  try {
    await db.deleteResident(parseInt(req.params.id));
    res.json({ success: true });
  } catch(err) { res.status(500).json({ error: err.message }); }
});

// ==================== ENTRY API ====================

app.post('/api/entry', async (req, res) => {
  const { type, block, apartment_no, visitor_name } = req.body;
  if (!type || !block || !apartment_no)
    return res.status(400).json({ error: 'Tip, blok ve daire numarası zorunludur' });

  try {
    const resident = await db.getResident(block, parseInt(apartment_no));
    if (!resident) return res.status(404).json({ error: 'Bu dairede kayıtlı sakin bulunamadı' });

    const logResult = await db.addEntryLog(
      type, block, parseInt(apartment_no),
      resident.name, resident.phone,
      visitor_name,
      resident.name2, resident.phone2,
      resident.name3, resident.phone3
    );
    const logId = logResult.lastInsertRowid;

    let waResult   = { success: false, error: 'WhatsApp bağlı değil' };
    let waResult2  = { success: false };
    let waResult3  = { success: false };
    let voiceResult  = { success: false };
    let voiceResult2 = { success: false };
    let voiceResult3 = { success: false };

    const status = wa.getStatus();

    if (status.isReady) {
      const getTRTime = () => {
        const now = new Date();
        const trTimeStr = now.toLocaleString('tr-TR', { timeZone: 'Europe/Istanbul' });
        const trHour = parseInt(now.toLocaleString('en-US', { hour: 'numeric', hour12: false, timeZone: 'Europe/Istanbul' }));
        const trMin  = parseInt(now.toLocaleString('en-US', { minute: 'numeric', timeZone: 'Europe/Istanbul' }));
        return { full: trTimeStr, hour: trHour, min: trMin };
      };

      const getDynamicGreeting = () => {
        const { hour: h, min: m } = getTRTime();
        const totalMin = h * 60 + m;
        if (totalMin >= 300  && totalMin < 1050) return { text: 'iyi günler diler' };
        if (totalMin >= 1050 && totalMin < 1320) return { text: 'iyi akşamlar diler' };
        return { text: 'iyi geceler diler' };
      };

      const greeting = getDynamicGreeting();

      const createMsg = (msgType, residentName) => {
        const trTime = getTRTime();
        let base = `Sayın ${residentName},\n\n`;
        if      (msgType === 'kurye')       base += `🍕 Yemek siparişiniz siteden giriş yapmıştır.`;
        else if (msgType === 'kargo')       base += `📦 Kargonuz güvenlik kulübesi tarafından teslim alınmıştır.`;
        else if (msgType === 'misafir')     base += `👤 Misafiriniz siteden giriş yapmıştır.`;
        else if (msgType === 'servis')      base += `🛠️ Teknik servis (İnternet/Tesisat/Elektrik vb.) siteden giriş yapmıştır.`;
        else if (msgType === 'beyaz_esya')  base += `🚚 Beyaz eşya teslimatı için giriş yapılmıştır.`;
        else if (msgType === 'mobilya')     base += `🛋️ Mobilya teslimatı/kurulumu için giriş yapılmıştır.`;
        else if (msgType === 'perde')       base += `🧵 Perde / Dekorasyon hizmeti için siteden giriş yapılmıştır.`;
        else if (msgType === 'hali_yikama') base += `🧺 Halı yıkama firması teslimat/alım için giriş yapmıştır.`;
        else if (msgType === 'market')      base += `🛒 Market siparişiniz siteden giriş yapmıştır.`;
        else if (msgType === 'eczane')      base += `💊 Eczane siparişiniz/ilacınız güvenlik kulübesine teslim edilmiştir.`;
        else if (msgType === 'temizlik')    base += `🧹 Temizlik görevlisi siteden giriş yapmıştır.`;
        else if (msgType === 'emanet') {
          const content = visitor_name ? ` (${visitor_name})` : '';
          base += `🎁 Size bir emanet/eşya${content} bırakılmıştır. Güvenlik kulübesinden teslim alabilirsiniz.`;
        }
        let footer = `\n\n📍 ${block} Blok - Daire ${apartment_no}\n🕙 ${trTime.full}`;
        footer += `\n\nLütfen anketi onaylayın veya bu mesaja EVET/HAYIR yazarak yanıt verin.`;
        footer += `\n\n🛡️ *Arem Güvenlik ${greeting.text}*`;
        return base + footer;
      };

      const pollQuestion = 'Girişi onaylıyor musunuz?';
      const pollOptions  = ['EVET', 'HAYIR'];

      // 1. Numara
      const message = createMsg(type, resident.name);
      waResult = await wa.sendMessage(resident.phone, message);
      await wa.sendPoll(resident.phone, pollQuestion, pollOptions, logId);

      // TTS arka planda
      (async () => {
        try {
          const vp1 = await tts.generateEntryVoice(type, resident.name, visitor_name);
          if (vp1) await wa.sendVoiceMessage(resident.phone, vp1);
          if (resident.phone2) {
            const vp2 = await tts.generateEntryVoice(type, resident.name2 || resident.name, visitor_name);
            if (vp2) await wa.sendVoiceMessage(resident.phone2, vp2);
          }
          if (resident.phone3) {
            const vp3 = await tts.generateEntryVoice(type, resident.name3 || resident.name, visitor_name);
            if (vp3) await wa.sendVoiceMessage(resident.phone3, vp3);
          }
        } catch(e) { console.error('⚠️ [TTS] Arka plan hatası:', e.message); }
      })();

      // 2. Numara
      if (resident.phone2) {
        const message2 = createMsg(type, resident.name2 || resident.name);
        waResult2 = await wa.sendMessage(resident.phone2, message2);
        await wa.sendPoll(resident.phone2, pollQuestion, pollOptions, logId);
      }

      // 3. Numara
      if (resident.phone3) {
        const message3 = createMsg(type, resident.name3 || resident.name);
        waResult3 = await wa.sendMessage(resident.phone3, message3);
        await wa.sendPoll(resident.phone3, pollQuestion, pollOptions, logId);
      }

      // İzleme kopyası
      try {
        const settings = await db.getSettings();
        if (settings.monitor_enabled === '1' && settings.monitor_phone) {
          const monitorMsg = `📢 *SİTE GİRİŞ BİLGİSİ (KOPYA)*\n------------------\n${message}`;
          wa.sendMessage(settings.monitor_phone, monitorMsg).then(r => {
            console.log(r.success ? '✅ [İzleme] Kopya iletildi.' : `❌ [İzleme] Kopya iletilemedi: ${r.error}`);
          });
        }
      } catch(monitorErr) {
        console.error('⚠️ [İzleme] Kopya mesaj hatası:', monitorErr.message);
      }

      // Gönderim durumlarını kaydet
      await db.updateEntryLog(logId, {
        whatsapp_sent:  waResult.success  ? 1 : 0,
        whatsapp_sent2: waResult2.success ? 1 : 0,
        whatsapp_sent3: waResult3.success ? 1 : 0,
        voice_sent:     voiceResult.success  ? 1 : 0,
        voice_sent2:    voiceResult2.success ? 1 : 0,
        voice_sent3:    voiceResult3.success ? 1 : 0,
        ack_status:  waResult.success  ? 1 : -1,
        ack_status2: resident.phone2 ? (waResult2.success ? 1 : -1) : 0,
        ack_status3: resident.phone3 ? (waResult3.success ? 1 : -1) : 0,
      });
    }

    res.json({
      success: true, logId,
      resident: resident.name,
      whatsapp: waResult, whatsapp2: waResult2, whatsapp3: waResult3,
      voice: voiceResult, voice2: voiceResult2, voice3: voiceResult3,
    });

  } catch(err) {
    console.error('❌ [Entry] Giriş kaydı hatası:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ==================== CANLI ONAY BİLDİRİMİ (SSE) ====================

const sseClients = new Set();

app.get('/api/onay-stream', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.write('data: {"type":"connected"}\n\n');
  sseClients.add(res);
  req.on('close', () => sseClients.delete(res));
});

function yayinlaOnayGuncelleme(logId, confirmation, confirmedBy) {
  const data = JSON.stringify({ type: 'onay', logId, confirmation, confirmedBy });
  sseClients.forEach(client => {
    try { client.write(`data: ${data}\n\n`); } catch(e) { sseClients.delete(client); }
  });
}

// ==================== LOG API ====================

app.get('/api/logs', async (req, res) => {
  const { date, limit, search, offset } = req.query;
  try {
    const logs = await db.getEntryLogs(parseInt(limit) || 50, date || null, search || null, parseInt(offset) || 0);
    res.json(logs);
  } catch(err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/logs/stats', async (req, res) => {
  const { date } = req.query;
  try {
    res.json(await db.getLogStats(date || null));
  } catch(err) { res.status(500).json({ error: err.message }); }
});

// ==================== WHATSAPP ACK API ====================

app.post('/api/logs/:id/ack', async (req, res) => {
  try {
    const logId = parseInt(req.params.id);
    const { phoneSlot, ackStatus } = req.body;
    const slotMap = { 1: 'ack_status', 2: 'ack_status2', 3: 'ack_status3' };
    const field = slotMap[phoneSlot];
    if (!field) return res.status(400).json({ error: 'Geçersiz phoneSlot (1, 2 veya 3 olmalı)' });
    await db.updateEntryLog(logId, { [field]: ackStatus });
    res.json({ success: true });
  } catch(err) {
    res.status(500).json({ error: err.message });
  }
});

// ==================== SETUP API ====================

app.get('/api/setup/status', async (req, res) => {
  try { res.json({ setup_complete: await db.getSetupStatus() }); }
  catch(err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/setup/complete', async (req, res) => {
  const { site_name, blocks, security_name, apt_types, apt_type_note } = req.body;
  if (!site_name || !blocks) return res.status(400).json({ error: 'Site ismi ve blok bilgisi zorunludur' });
  try {
    await db.completeSetup(site_name, blocks, security_name, apt_types, apt_type_note);
    res.json({ success: true });
  } catch(err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/setup/shortcut', (req, res) => {
  try {
    if (global.createDesktopShortcut) res.json(global.createDesktopShortcut());
    else res.json({ success: true, message: 'Geliştirme modunda kısayol atlandı.' });
  } catch(err) { res.status(500).json({ success: false, error: err.message }); }
});

// ==================== ASİSTAN API ====================

app.get('/api/assistant/pending', async (req, res) => {
  try {
    const pending = await db.getPendingConfirmations();
    res.json({ count: pending.length, items: pending });
  } catch(err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/assistant/alerts', async (req, res) => {
  try {
    const alerts = [];
    const now = new Date();
    const hour = parseInt(now.toLocaleString('en-US', { hour: 'numeric', hour12: false, timeZone: 'Europe/Istanbul' }));

    const waStatus = wa.getStatus();
    if (!waStatus.isReady) {
      alerts.push({ level: 'red', icon: '📸', title: 'WhatsApp Bağlı Değil', subtitle: 'Bildirimler gönderilemiyor. QR kodu tarayın.' });
    }

    const pending = await db.getPendingConfirmations();
    if (pending.length > 0) {
      const longPending = pending.filter(p => {
        const diff = (Date.now() - new Date(p.timestamp.replace(' ', 'T')).getTime()) / 60000;
        return diff > 30;
      });
      if (longPending.length > 0) {
        alerts.push({ level: 'red', icon: '⏰', title: `${longPending.length} Onay 30 Dk+ Bekliyor`, subtitle: longPending.map(p => `${p.block}-${p.apartment_no} (${p.resident_name})`).join(', ') });
      } else {
        alerts.push({ level: 'yellow', icon: '⏳', title: `${pending.length} Onay Bekliyor`, subtitle: pending.map(p => `${p.block}-${p.apartment_no}`).join(', ') });
      }
    }

    if (hour >= 0 && hour < 6) {
      const nightLogs = await db.getEntryLogs(10, null, null, 0);
      const recentNight = nightLogs.filter(l => {
        const logHour = parseInt(new Date(l.timestamp.replace(' ', 'T')).toLocaleString('en-US', { hour: 'numeric', hour12: false, timeZone: 'Europe/Istanbul' }));
        return logHour >= 0 && logHour < 6;
      });
      if (recentNight.length > 0) {
        alerts.push({ level: 'red', icon: '🌙', title: 'Gece Saati Giriş Tespit Edildi', subtitle: `${recentNight.length} giriş gece 00:00-06:00 arasında yapıldı` });
      }
    }

    const today = new Date();
    const dateStr = `${today.getFullYear()}-${String(today.getMonth()+1).padStart(2,'0')}-${String(today.getDate()).padStart(2,'0')}`;
    const todayLogs = await db.getEntryLogs(500, dateStr);
    const aptCounts = {};
    todayLogs.forEach(l => { const key = `${l.block}-${l.apartment_no}`; aptCounts[key] = (aptCounts[key] || 0) + 1; });
    const highTraffic = Object.entries(aptCounts).filter(([, c]) => c >= 10);
    if (highTraffic.length > 0) {
      alerts.push({ level: 'yellow', icon: '🔥', title: 'Yoğun Giriş Trafiği', subtitle: highTraffic.map(([k, c]) => `${k}: ${c} giriş`).join(', ') });
    }

    res.json({ alerts });
  } catch(err) { res.status(500).json({ error: err.message }); }
});

const assistantEngine = require('./assistant_engine');
app.post('/api/assistant/query', async (req, res) => {
  try {
    const { query } = req.body;
    if (!query) return res.status(400).json({ error: 'Sorgu boş olamaz' });
    res.json(await assistantEngine.processQuery(query, db, wa));
  } catch(err) {
    res.status(500).json({ response: 'Bir hata oluştu: ' + err.message });
  }
});

// ==================== SETTINGS API ====================

app.get('/api/settings', async (req, res) => {
  try { res.json(await db.getSettings()); }
  catch(err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/settings', async (req, res) => {
  const { key, value } = req.body;
  if (!key || value === undefined) return res.status(400).json({ error: 'key ve value zorunludur' });
  try {
    await db.updateSetting(key, value);
    res.json({ success: true });
  } catch(err) { res.status(500).json({ error: err.message }); }
});

// ==================== WHATSAPP API ====================

app.get('/api/whatsapp/status', (req, res) => res.json(wa.getStatus()));
app.get('/api/whatsapp/qr', (req, res) => {
  const qr = wa.getQR();
  res.json(qr ? { qr } : { qr: null, message: 'QR kod mevcut değil.' });
});
app.post('/api/whatsapp/logout', async (req, res) => {
  try { res.json(await wa.logout()); }
  catch(err) { res.status(500).json({ error: err.message }); }
});

  app.post('/api/whatsapp/pairing', async (req, res) => {
    try {
      const { phone } = req.body;
      if (!phone) return res.status(400).json({ error: 'Telefon numarası gerekli' });
      const result = await wa.requestPairingCode(phone);
      res.json(result);
    } catch(err) {
      res.status(500).json({ error: err.message });
    }
  });

// ==================== MANUEL ONAY ====================

app.post('/api/entry/:id/approve', async (req, res) => {
  try {
    await db.updateEntryLog(parseInt(req.params.id), { confirmation: 'MANUEL ONAY', confirmed_by: 'Güvenlik Görevlisi' });
    res.json({ success: true });
  } catch(err) { res.status(500).json({ error: err.message }); }
});

// ==================== ONAY İŞLEYİCİ (WhatsApp → DB) ====================
// DÜZELTİLDİ: phoneSlot artık Katman 1'de de doğru hesaplanıyor

wa.onConfirmation(async (from, answer, logId) => {
  try {
    const normalizedFrom = from.replace(/\D/g, '').slice(-10);
    console.log(`📩 [Onay] Yanıt: telefon=${normalizedFrom}, cevap=${answer}, logId=${logId || 'yok'}`);

    let targetLog   = null;
    let matchMethod = '';
    let phoneSlot   = 1;

    const clean = p => p ? p.replace(/\D/g, '').slice(-10) : null;

    // === KATMAN 1: Doğrudan logId ile eşleştirme ===
    if (logId) {
      const directLog = await db.getEntryLogById(logId);
      if (directLog && directLog.type === 'misafir' && directLog.confirmation === 'Bekliyor...') {
        targetLog = directLog;
        matchMethod = 'logId (doğrudan)';
        // DÜZELTİLDİ: Hangi numaranın cevap verdiğini doğru belirle
        if      (clean(directLog.resident_phone2) === normalizedFrom) phoneSlot = 2;
        else if (clean(directLog.resident_phone3) === normalizedFrom) phoneSlot = 3;
        else phoneSlot = 1;
        console.log(`✅ [Onay] Katman 1: logId ile eşleşti (ID:${logId}, slot:${phoneSlot})`);
      }
    }

    // === KATMAN 2: Telefon bazlı ===
    if (!targetLog) {
      const pendingLogs = await db.getPendingConfirmations();
      console.log(`🔍 [Onay] Katman 2: ${pendingLogs.length} bekleyen kayıt`);
      for (const log of pendingLogs) {
        if (clean(log.resident_phone)  === normalizedFrom) { targetLog = log; phoneSlot = 1; break; }
        if (clean(log.resident_phone2) === normalizedFrom) { targetLog = log; phoneSlot = 2; break; }
        if (clean(log.resident_phone3) === normalizedFrom) { targetLog = log; phoneSlot = 3; break; }
      }
      if (targetLog) {
        matchMethod = 'telefon (pending sorgusu)';
        console.log(`✅ [Onay] Katman 2: Eşleşme (ID:${targetLog.id}, slot:${phoneSlot})`);
      }
    }

    // === KATMAN 3: Geniş arama ===
    if (!targetLog) {
      const logs = await db.getEntryLogs(500);
      for (const log of logs) {
        if (log.type !== 'misafir' || log.confirmation !== 'Bekliyor...') continue;
        if (clean(log.resident_phone)  === normalizedFrom) { targetLog = log; phoneSlot = 1; break; }
        if (clean(log.resident_phone2) === normalizedFrom) { targetLog = log; phoneSlot = 2; break; }
        if (clean(log.resident_phone3) === normalizedFrom) { targetLog = log; phoneSlot = 3; break; }
      }
      if (targetLog) {
        matchMethod = 'telefon (geniş arama)';
        console.log(`✅ [Onay] Katman 3: Eşleşme (ID:${targetLog.id}, slot:${phoneSlot})`);
      }
    }

    if (!targetLog) {
      console.log(`❌ [Onay] Eşleşme bulunamadı! Aranan: ${normalizedFrom}`);
      return;
    }

    let confirmedBy = targetLog.resident_name;
    if (phoneSlot === 2 && targetLog.resident_name2) confirmedBy = targetLog.resident_name2;
    if (phoneSlot === 3 && targetLog.resident_name3) confirmedBy = targetLog.resident_name3;

    await db.updateEntryLog(targetLog.id, { confirmation: answer, confirmed_by: confirmedBy });
    yayinlaOnayGuncelleme(targetLog.id, answer, confirmedBy);

    const emoji = answer === 'EVET' ? '✅ GİRİŞ ONAYLANDI' : '❌ GİRİŞ REDDEDİLDİ';
    console.log(`🎊 [Onay] ${confirmedBy} → ${emoji} (ID:${targetLog.id}, ${targetLog.block}${targetLog.apartment_no}, yöntem:${matchMethod}, slot:${phoneSlot})`);

  } catch(err) {
    console.error('❌ [Onay] Hata:', err.message);
  }
});

// ==================== ARKA PLAN GÖREVLERİ ====================

setInterval(async () => {
  try {
    const approvedRes = await db.autoApproveEntries();
    const deletedRes  = await db.cleanupOldLogs();
    if (approvedRes.changes > 0 || deletedRes.changes > 0) {
      console.log(`🧹 Arka plan: ${approvedRes.changes} otomatik onay, ${deletedRes.changes} eski log silindi.`);
    }
  } catch(err) { console.error('⚠️ Arka plan görevi hatası:', err.message); }
}, 1000 * 60 * 60);

// ==================== SERVER BAŞLAT ====================

function startServer(port, callback) {
  wa.initWhatsApp();
  const listenPort = port || PORT;
  const server = app.listen(listenPort, async () => {
    const actualPort = server.address().port;
    console.log(`\n🟢 Site Güvenlik Sunucusu Çalışıyor: http://localhost:${actualPort}`);
    console.log(`📌 http://localhost:${actualPort}/admin.html`);
    console.log(`📌 http://localhost:${actualPort}/logs.html`);
    console.log(`📌 http://localhost:${actualPort}/whatsapp.html\n`);
    if (callback) callback(actualPort);
  });

  server.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
      console.error(`❌ Port ${listenPort} kullanımda, ${listenPort + 1} deneniyor...`);
      server.close();
      startServer(listenPort + 1, callback);
    }
  });

  return server;
}

process.on('uncaughtException', (err) => {
  console.error('💥 Yakalanmamış hata:', err.message);
  if (require.main === module) process.exit(1);
});

process.on('unhandledRejection', (reason) => {
  console.error('💥 Yakalanmamış Promise reddi:', reason);
  if (require.main === module) process.exit(1);
});

if (require.main === module) startServer(PORT);

module.exports = { startServer, app };
