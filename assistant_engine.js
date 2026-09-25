'use strict';

const raporEngine = require('./rapor_engine');

// ==================== TÜRKÇE NORMALİZASYON ====================

function normalize(text) {
    return text
        .toLowerCase()
        .replace(/ğ/g, 'g').replace(/ü/g, 'u').replace(/ş/g, 's')
        .replace(/ı/g, 'i').replace(/ö/g, 'o').replace(/ç/g, 'c')
        .replace(/Ğ/g, 'g').replace(/Ü/g, 'u').replace(/Ş/g, 's')
        .replace(/İ/g, 'i').replace(/Ö/g, 'o').replace(/Ç/g, 'c')
        .trim();
}

function icerir(q, kelimeler) {
    return kelimeler.some(k => q.includes(normalize(k)));
}

// ==================== ZAMAN ALGILAMA ====================

function parseDateFromQuery(q) {
    const now = new Date();
    const today = formatDate(now);

    if (icerir(q, ['bugun', 'bugün', 'bugunki', 'bugünkü', 'bugunun', 'bugünün', 'guncel', 'güncel', 'simdi', 'şimdi', 'gosterki', 'son girişler', 'son girisler'])) {
        return { start: today, end: today, label: 'Bugün' };
    }
    if (icerir(q, ['dun', 'dün', 'dunki', 'dünkü', 'dun ne', 'dün ne'])) {
        const d = new Date(now); d.setDate(d.getDate() - 1);
        return { start: formatDate(d), end: formatDate(d), label: 'Dün' };
    }
    if (icerir(q, ['bu hafta', 'buhafta', 'haftalik', 'haftalık'])) {
        const d = new Date(now); d.setDate(d.getDate() - 7);
        return { start: formatDate(d), end: today, label: 'Bu hafta' };
    }
    if (icerir(q, ['gecen hafta', 'geçen hafta'])) {
        const end = new Date(now); end.setDate(end.getDate() - 7);
        const start = new Date(now); start.setDate(start.getDate() - 14);
        return { start: formatDate(start), end: formatDate(end), label: 'Geçen hafta' };
    }
    if (icerir(q, ['bu ay', 'buay', 'aylik', 'aylık', 'bu ayki', 'bu ayın'])) {
        const d = new Date(now.getFullYear(), now.getMonth(), 1);
        return { start: formatDate(d), end: today, label: 'Bu ay' };
    }
    if (icerir(q, ['gecen ay', 'geçen ay', 'gecen ayki', 'geçen ayın'])) {
        const start = new Date(now.getFullYear(), now.getMonth() - 1, 1);
        const end = new Date(now.getFullYear(), now.getMonth(), 0);
        return { start: formatDate(start), end: formatDate(end), label: 'Geçen ay' };
    }

    const sonGunMatch = q.match(/son\s+(\d+)\s+gun/);
    if (sonGunMatch) {
        const gun = parseInt(sonGunMatch[1]);
        const d = new Date(now); d.setDate(d.getDate() - gun);
        return { start: formatDate(d), end: today, label: `Son ${gun} gün` };
    }

    const gunOnceMatch = q.match(/(\d+)\s+gun\s+once/);
    if (gunOnceMatch) {
        const gun = parseInt(gunOnceMatch[1]);
        const d = new Date(now); d.setDate(d.getDate() - gun);
        const s = formatDate(d);
        return { start: s, end: s, label: `${gun} gün önce` };
    }

    const aylar = {
        'ocak': 0, 'subat': 1, 'şubat': 1, 'mart': 2, 'nisan': 3,
        'mayis': 4, 'mayıs': 4, 'haziran': 5, 'temmuz': 6,
        'agustos': 7, 'ağustos': 7, 'eylul': 8, 'eylül': 8,
        'ekim': 9, 'kasim': 10, 'kasım': 10, 'aralik': 11, 'aralık': 11
    };
    for (const [ad, idx] of Object.entries(aylar)) {
        if (q.includes(ad)) {
            const yil = now.getMonth() <= idx ? now.getFullYear() - 1 : now.getFullYear();
            const start = new Date(yil, idx, 1);
            const end = new Date(yil, idx + 1, 0);
            return { start: formatDate(start), end: formatDate(end), label: `${ad.charAt(0).toUpperCase() + ad.slice(1)} ayı` };
        }
    }

    if (icerir(q, ['gecen yil', 'geçen yıl'])) {
        const start = new Date(now.getFullYear() - 1, 0, 1);
        const end = new Date(now.getFullYear() - 1, 11, 31);
        return { start: formatDate(start), end: formatDate(end), label: 'Geçen yıl' };
    }

    return { start: today, end: today, label: 'Bugün' };
}

function formatDate(d) {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function formatDateTime(ts) {
    try {
        return new Date(ts.replace(' ', 'T')).toLocaleString('tr-TR', {
            day: '2-digit', month: '2-digit', year: 'numeric',
            hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Istanbul'
        });
    } catch (e) { return ts; }
}

function formatTime(ts) {
    try {
        return new Date(ts.replace(' ', 'T')).toLocaleTimeString('tr-TR', {
            hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Istanbul'
        });
    } catch (e) { return ts; }
}

// ==================== ETİKETLER ====================

const TIP_ETIKET = {
    kurye: '🍕 Yemek Kuryesi', kargo: '📦 Kargo', misafir: '👤 Misafir',
    servis: '🛠️ Teknik Servis', beyaz_esya: '🚚 Beyaz Eşya', mobilya: '🛋️ Mobilya',
    hali_yikama: '🧺 Halı Yıkama', market: '🛒 Market', perde: '🧵 Perde', emanet: '🎁 Emanet',
    eczane: '💊 Eczane Kuryesi', temizlik: '🧹 Temizlik Görevlisi'
};

const ONAY_ETIKET = {
    'EVET': '✅ Onaylandı', 'HAYIR': '❌ Reddedildi',
    'OTOMATiK ONAY': '🔄 Oto Onay', 'MANUEL ONAY': '👮 Manuel Onay', 'Bekliyor...': '⏳ Bekliyor'
};

// ==================== HTML TABLO ====================

function htmlTablo(basliklar, satirlar) {
    if (satirlar.length === 0) return '<i>Kayıt bulunamadı.</i>';
    const th = basliklar.map(b => `<th>${b}</th>`).join('');
    const tr = satirlar.map(s => `<tr>${s.map(h => `<td>${h}</td>`).join('')}</tr>`).join('');
    return `<table><tr>${th}</tr>${tr}</table>`;
}

// ==================== LOG FİLTRELE ====================

async function getLogs(db, tarih, arama = null, limit = 1000) {
    if (tarih.start === tarih.end) {
        return await db.getEntryLogs(limit, tarih.start, arama);
    }
    const tumLogs = await db.getEntryLogs(2000, null, arama);
    return tumLogs.filter(l => {
        const t = l.timestamp ? l.timestamp.substring(0, 10) : '';
        return t >= tarih.start && t <= tarih.end;
    });
}

// ==================== ANA SORGU MOTORU ====================

async function processQuery(query, db, wa) {
    const q = normalize(query);
    const now = new Date();
    const today = formatDate(now);
    const tarih = parseDateFromQuery(q);

    // ── SELAMLAMA ──────────────────────────────────────────
    const selamlar = ['merhaba', 'selam', 'hey', 'iyi gunler', 'iyi sabahlar', 'iyi akshamlar', 'iyi geceler', 'gunaydın', 'gunaydin'];
    if (selamlar.some(s => q === s || q.startsWith(s + ' '))) {
        const saat = parseInt(now.toLocaleString('en-US', { hour: 'numeric', hour12: false, timeZone: 'Europe/Istanbul' }));
        const karsilama = saat < 12 ? 'Günaydın' : saat < 18 ? 'İyi günler' : 'İyi akşamlar';
        const todayLogs = await db.getEntryLogs(500, today);
        const pending = await db.getPendingConfirmations();
        return {
            response: `${karsilama}! 👋 Ben Site Güvenlik Asistanıyım.\n\nBugün özet:\n📊 ${todayLogs.length} giriş kaydı\n⏳ ${pending.length} bekleyen onay\n📱 WhatsApp: ${wa.getStatus().isReady ? '✅ Bağlı' : '❌ Bağlı değil'}\n\nNe öğrenmek istersiniz?`
        };
    }

    if (icerir(q, ['nasilsin', 'nasılsın', 'nasil gidiyor', 'ne haber', 'ne var ne yok'])) {
        const pending = await db.getPendingConfirmations();
        const todayLogs = await db.getEntryLogs(500, today);
        return {
            response: `İyiyim, teşekkürler! 😊 Sistem sorunsuz çalışıyor.\n\nHızlı özet:\n📊 Bugün ${todayLogs.length} giriş kaydı\n⏳ ${pending.length} bekleyen onay\n📱 WhatsApp: ${wa.getStatus().isReady ? '✅ Bağlı' : '❌ Bağlı değil'}`
        };
    }

    if (icerir(q, ['tesekkur', 'teşekkür', 'sagol', 'sağol', 'eyvallah', 'super', 'süper', 'harika', 'mukemmel', 'mükemmel'])) {
        return { response: 'Rica ederim! 😊 Başka bir konuda yardımcı olabilir miyim?' };
    }

    // ── BUGÜNKÜ GİRİŞLER (özel komut) ────────────────────
    if (icerir(q, ['bugunki girisleri goster', 'bugünkü girişleri göster', 'bugunki girisler', 'bugun ne var', 'bugun kim geldi', 'bugün kim geldi', 'son girisler', 'son girişler', 'guncel girisler'])) {
        const logs = await db.getEntryLogs(20, today);
        if (logs.length === 0) {
            return { response: '📋 Bugün henüz giriş kaydı yok.' };
        }
        const satirlar = logs.map(l => [
            formatTime(l.timestamp),
            `${l.block}-${l.apartment_no}`,
            TIP_ETIKET[l.type] || l.type,
            l.visitor_name || l.resident_name || '-',
            l.type === 'misafir' ? (ONAY_ETIKET[l.confirmation] || '⏳ Bekliyor') : '-'
        ]);
        const html = `<b>📋 Bugünkü Girişler — ${logs.length} kayıt</b><br><br>` +
            htmlTablo(['Saat', 'Daire', 'Tip', 'Kişi', 'Onay'], satirlar);
        return { html: true, response: html };
    }

    // ── DAİRE SORGUSU ──────────────────────────────────────
    const daireMatch = q.match(/([a-d])\s*[-]?\s*(\d+)/);
    if (daireMatch && !icerir(q, ['ekle', 'kaydet', 'yeni', 'sil', 'guncelle'])) {
        const block = daireMatch[1].toUpperCase();
        const aptNo = parseInt(daireMatch[2]);

        const resident = await db.getResident(block, aptNo);
        if (!resident) {
            return { response: `❌ ${block}-${aptNo} dairesinde kayıtlı sakin bulunamadı.` };
        }

        const logs = await getLogs(db, tarih, `${block}${aptNo}`);

        const tipSayilari = {};
        logs.forEach(l => { tipSayilari[l.type] = (tipSayilari[l.type] || 0) + 1; });

        const istatistik = Object.entries(tipSayilari)
            .sort((a, b) => b[1] - a[1])
            .map(([tip, sayi]) => `${TIP_ETIKET[tip] || tip}: ${sayi}`)
            .join(', ');

        const sonGirisler = logs.slice(0, 10).map(l => [
            formatDateTime(l.timestamp),
            TIP_ETIKET[l.type] || l.type,
            l.visitor_name || '-',
            l.type === 'misafir' ? (ONAY_ETIKET[l.confirmation] || '⏳ Bekliyor') : '-'
        ]);

        let html = `<b>🏠 ${block} Blok - Daire ${aptNo} | ${tarih.label}</b><br>`;
        html += `👤 Sakin: <b>${resident.name}</b> (${resident.phone})<br>`;
        if (resident.name2) html += `👤 2. Kişi: ${resident.name2} (${resident.phone2})<br>`;
        if (resident.name3) html += `👤 3. Kişi: ${resident.name3} (${resident.phone3})<br>`;
        if (resident.plaka) html += `🚗 Plaka: ${resident.plaka}<br>`;
        html += `<br><b>Toplam ${logs.length} giriş kaydı</b>`;
        if (istatistik) html += `<br><small>${istatistik}</small>`;
        html += '<br><br>';

        if (logs.length === 0) {
            html += `<i>${tarih.label} için giriş kaydı yok.</i>`;
        } else {
            html += htmlTablo(['Tarih/Saat', 'Tip', 'Ziyaretçi', 'Onay'], sonGirisler);
            if (logs.length > 10) html += `<br><small>Son 10 kayıt gösteriliyor. Toplam: ${logs.length}</small>`;
        }

        return { html: true, response: html };
    }

    // ── BEKLEYEN ONAYLAR ───────────────────────────────────
    if (icerir(q, ['bekleyen', 'onay bekle', 'yanitsiz', 'yanıtsız', 'onaylanmamis', 'onaylanmamış', 'cevap bekle'])) {
        const pending = await db.getPendingConfirmations();
        if (pending.length === 0) {
            return { response: '✅ Bekleyen onay yok. Tüm misafir girişleri yanıtlanmış.' };
        }
        const satirlar = pending.map(p => {
            const diff = Math.round((Date.now() - new Date(p.timestamp.replace(' ', 'T')).getTime()) / 60000);
            return [`${p.block}-${p.apartment_no}`, p.resident_name, `${diff} dk`, formatDateTime(p.timestamp)];
        });
        const html = `<b>⏳ ${pending.length} Bekleyen Onay</b><br><br>` +
            htmlTablo(['Daire', 'Sakin', 'Bekleme', 'Giriş Saati'], satirlar);
        return { html: true, response: html };
    }

    // ── İSTATİSTİK ─────────────────────────────────────────
    // ── TİP BAZLI SAYIM ("bugün kaç kargo", "bu hafta kaç misafir") ──
    {
        const tipEslesme = {
            kargo: ['kargo'],
            kurye: ['yemek kurye', 'yemek siparis', 'yemek sipariş', 'yemekkurye'],
            misafir: ['misafir', 'ziyaretci', 'ziyaretçi'],
            market: ['market'],
            eczane: ['eczane', 'ilac', 'ilaç'],
            temizlik: ['temizlik'],
            servis: ['teknik servis', 'teknikservis', 'tamir'],
            beyaz_esya: ['beyaz esya', 'beyaz eşya', 'beyazesya'],
            mobilya: ['mobilya'],
            hali_yikama: ['hali yikama', 'halı yıkama', 'haliyikama', 'hali'],
            perde: ['perde'],
            emanet: ['emanet']
        };
        // Sayma sorusu mu? (kac/kaç/sayi/adet + tip)
        const saymaSorusu = icerir(q, ['kac', 'kaç', 'sayi', 'sayı', 'adet', 'ne kadar', 'kacar', 'kaçar']);
        if (saymaSorusu) {
            for (const [tip, kelimeler] of Object.entries(tipEslesme)) {
                if (icerir(q, kelimeler)) {
                    const logs = await getLogs(db, tarih);
                    const filtreli = logs.filter(l => l.type === tip);
                    const etiket = TIP_ETIKET[tip] || tip;
                    if (filtreli.length === 0) {
                        return { response: `📊 ${tarih.label}: Hiç ${etiket} girişi yok.` };
                    }
                    return { response: `📊 <b>${tarih.label}</b><br>${etiket}: <b>${filtreli.length}</b> giriş` };
                }
            }
        }
    }

    // ── SON X NE ZAMAN / X GELDİ Mİ ("en son kargo ne zaman", "bugün misafir geldi mi") ──
    {
        const tipEslesme2 = {
            kargo: ['kargo'],
            kurye: ['yemek kurye', 'yemek siparis', 'yemek sipariş'],
            misafir: ['misafir', 'ziyaretci', 'ziyaretçi'],
            market: ['market'],
            eczane: ['eczane', 'ilac', 'ilaç'],
            temizlik: ['temizlik'],
            servis: ['teknik servis', 'tamir'],
            beyaz_esya: ['beyaz esya', 'beyaz eşya'],
            mobilya: ['mobilya'],
            hali_yikama: ['hali yikama', 'halı yıkama', 'hali'],
            perde: ['perde'],
            emanet: ['emanet']
        };
        // "en son ... ne zaman" veya "... geldi mi" kalibi
        const sonNeZaman = icerir(q, ['en son', 'son ne zaman', 'ne zaman geldi', 'en son ne zaman']);
        const geldiMi = icerir(q, ['geldi mi', 'var mi', 'var mı', 'oldu mu', 'girdi mi']);
        if (sonNeZaman || geldiMi) {
            for (const [tip, kelimeler] of Object.entries(tipEslesme2)) {
                if (icerir(q, kelimeler)) {
                    // "geldi mi" ise zaman filtreli, "en son" ise tüm zamanlar
                    const logs = geldiMi ? await getLogs(db, tarih) : await db.getEntryLogs(2000, null);
                    const filtreli = logs.filter(l => l.type === tip);
                    const etiket = TIP_ETIKET[tip] || tip;

                    if (geldiMi) {
                        if (filtreli.length === 0) {
                            return { response: `❌ ${tarih.label}: Hiç ${etiket} girişi olmadı.` };
                        }
                        const sonu = filtreli[0];
                        return { response: `✅ ${tarih.label}: <b>${filtreli.length}</b> ${etiket} girişi var.<br>En son: ${formatDateTime(sonu.timestamp)} — ${sonu.block}-${sonu.apartment_no}` };
                    } else {
                        if (filtreli.length === 0) {
                            return { response: `📋 Hiç ${etiket} kaydı bulunamadı.` };
                        }
                        const sonu = filtreli[0];
                        return { response: `📦 En son ${etiket}:<br><b>${formatDateTime(sonu.timestamp)}</b><br>${sonu.block}-${sonu.apartment_no} (${sonu.resident_name || '-'})` };
                    }
                }
            }
        }
    }

    if (icerir(q, ['kac giris', 'kaç giriş', 'istatistik', 'ozet', 'özet', 'rapor', 'toplam', 'kac kisi', 'kaç kişi', 'ne kadar'])) {

        if (icerir(q, ['pdf', 'gonder', 'gönder', 'whatsapp', 'masaustu', 'masaüstü'])) {
            try {
                const results = await raporEngine.createRapor(db, wa, tarih.start, tarih.end, {
                    whatsappPhone: icerir(q, ['gonder', 'gönder', 'whatsapp']) ? wa.getTargetPhone() : null,
                    pdfMasaustu: icerir(q, ['pdf', 'masaustu', 'masaüstü'])
                });
                let response = `✅ *${tarih.label}* için rapor hazırlandı.\n`;
                if (results.results.pdf) response += `\n📄 PDF: ${results.results.pdf}`;
                if (results.results.whatsapp) response += `\n💬 WhatsApp ile gönderildi.`;
                return { response };
            } catch (err) {
                return { response: `❌ Rapor hatası: ${err.message}` };
            }
        }

        const logs = await getLogs(db, tarih);
        const tipSayilari = {};
        logs.forEach(l => { tipSayilari[l.type] = (tipSayilari[l.type] || 0) + 1; });

        const satirlar = Object.entries(tipSayilari)
            .sort((a, b) => b[1] - a[1])
            .map(([tip, sayi]) => [TIP_ETIKET[tip] || tip, sayi]);

        let html = `<b>📊 ${tarih.label} İstatistik</b><br>`;
        html += `<b>Toplam: ${logs.length} giriş</b><br><br>`;
        html += satirlar.length === 0 ? '<i>Bu dönemde giriş kaydı yok.</i>' : htmlTablo(['Tip', 'Sayı'], satirlar);
        return { html: true, response: html };
    }

    // ── EN ÇOK ZİYARETÇİ ALAN DAİRE ───────────────────────
    if (icerir(q, ['en cok', 'en çok', 'en fazla', 'yogun', 'yoğun', 'en aktif', 'en hareketli'])) {
        const logs = await getLogs(db, tarih);
        const daireSayilari = {};
        logs.forEach(l => {
            const key = `${l.block}-${l.apartment_no}`;
            daireSayilari[key] = (daireSayilari[key] || 0) + 1;
        });
        const sirali = Object.entries(daireSayilari).sort((a, b) => b[1] - a[1]).slice(0, 10);
        if (sirali.length === 0) return { response: `📊 ${tarih.label} için veri yok.` };
        const html = `<b>🏆 ${tarih.label} — En Yoğun Daireler</b><br><br>` +
            htmlTablo(['Daire', 'Giriş Sayısı'], sirali);
        return { html: true, response: html };
    }

    // ── ANOMALİ TESPİTİ ────────────────────────────────────
    if (icerir(q, ['anormal', 'anomali', 'supheli', 'şüpheli', 'garip', 'dikkat'])) {
        const logs = await db.getEntryLogs(1000, today);
        const geceGirisleri = logs.filter(l => {
            try {
                const saat = parseInt(new Date(l.timestamp.replace(' ', 'T'))
                    .toLocaleString('en-US', { hour: 'numeric', hour12: false, timeZone: 'Europe/Istanbul' }));
                return saat >= 0 && saat < 6;
            } catch (e) { return false; }
        });
        const daireSayilari = {};
        logs.forEach(l => {
            const key = `${l.block}-${l.apartment_no}`;
            daireSayilari[key] = (daireSayilari[key] || 0) + 1;
        });
        const yogun = Object.entries(daireSayilari).filter(([, c]) => c >= 5);
        if (geceGirisleri.length === 0 && yogun.length === 0) {
            return { response: '✅ Bugün anormal bir giriş aktivitesi tespit edilmedi.' };
        }
        let html = '<b>🚨 Anomali Raporu — Bugün</b><br><br>';
        if (geceGirisleri.length > 0) {
            html += `<b>🌙 Gece Girişleri (00:00-06:00): ${geceGirisleri.length} adet</b><br>`;
            html += htmlTablo(['Daire', 'Saat', 'Tip'],
                geceGirisleri.slice(0, 5).map(l => [
                    `${l.block}-${l.apartment_no}`, formatTime(l.timestamp), TIP_ETIKET[l.type] || l.type
                ])) + '<br>';
        }
        if (yogun.length > 0) {
            html += `<b>🔥 Yoğun Trafik (5+ giriş): ${yogun.length} daire</b><br>`;
            html += htmlTablo(['Daire', 'Giriş Sayısı'],
                yogun.sort((a, b) => b[1] - a[1]).map(([k, c]) => [k, `${c} giriş`]));
        }
        return { html: true, response: html };
    }

    // ── WHATSAPP DURUMU ────────────────────────────────────
    if (icerir(q, ['whatsapp', 'bağlı', 'bagli', 'bildirim', 'mesaj'])) {
        const st = wa.getStatus();
        return {
            response: st.isReady
                ? '📱 WhatsApp bağlı ve aktif. Bildirimler gönderilmeye hazır. ✅'
                : `📱 WhatsApp bağlı değil.\nDurum: ${st.statusMessage}\n\nWhatsApp sayfasına giderek QR kodu tarayın.`
        };
    }

    // ── SAKİN ARAMA ───────────────────────────────────────
    if (icerir(q, ['ara', 'bul', 'kim', 'hangi', 'nerede', 'sakin', 'kisi', 'kişi'])) {
        const kelimeler = query.split(/\s+/).filter(k => k.length >= 3);
        if (kelimeler.length > 0) {
            const residents = await db.getAllResidents();
            const bulunanlar = residents.filter(r =>
                kelimeler.some(k =>
                    (r.name || '').toLowerCase().includes(k.toLowerCase()) ||
                    (r.name2 || '').toLowerCase().includes(k.toLowerCase()) ||
                    (r.name3 || '').toLowerCase().includes(k.toLowerCase()) ||
                    (r.phone || '').includes(k) ||
                    (r.plaka || '').toLowerCase().includes(k.toLowerCase())
                )
            );
            if (bulunanlar.length === 0) return { response: `❌ "${query}" için kayıt bulunamadı.` };
            const html = `<b>🔍 ${bulunanlar.length} sonuç bulundu</b><br><br>` +
                htmlTablo(['Daire', 'Ad Soyad', 'Telefon', 'Plaka'],
                    bulunanlar.map(r => [`${r.block}-${r.apartment_no}`, r.name, r.phone, r.plaka || '-']));
            return { html: true, response: html };
        }
    }

    // ── SAKİN EKLEME ──────────────────────────────────────
    const ekleMatch = query.match(/([A-Da-d])\s*[-]?\s*(\d+)[,:\s]+(.+?)[,\s]+(0\d{9,10})/);
    if (ekleMatch && icerir(q, ['ekle', 'kaydet', 'yeni', 'tanimla', 'tanımla'])) {
        const [, block, aptNo, name, phone] = ekleMatch;
        try {
            await db.addResident(block.toUpperCase(), parseInt(aptNo), name.trim(), phone.trim());
            return {
                response: `✅ Sakin eklendi!\n\n🏠 Daire: ${block.toUpperCase()}-${aptNo}\n👤 Ad: ${name.trim()}\n📞 Telefon: ${phone.trim()}`
            };
        } catch (e) {
            if (e.message.includes('UNIQUE')) return { response: `❌ ${block.toUpperCase()}-${aptNo} dairesinde zaten kayıtlı sakin var.` };
            return { response: `❌ Hata: ${e.message}` };
        }
    }

    // ── GECE GİRİŞLERİ ────────────────────────────────────
    if (icerir(q, ['gece', 'gece yarisi', 'gece yarısı', 'gece girisi', 'gece girişi'])) {
        const tumLogs = await db.getEntryLogs(1000, null);
        const geceLogs = tumLogs.filter(l => {
            try {
                const saat = parseInt(new Date(l.timestamp.replace(' ', 'T'))
                    .toLocaleString('en-US', { hour: 'numeric', hour12: false, timeZone: 'Europe/Istanbul' }));
                return saat >= 0 && saat < 6;
            } catch (e) { return false; }
        }).slice(0, 20);
        if (geceLogs.length === 0) return { response: '✅ Gece saatlerinde (00:00-06:00) giriş kaydı bulunamadı.' };
        const html = `<b>🌙 Gece Girişleri (00:00-06:00) — Son ${geceLogs.length} kayıt</b><br><br>` +
            htmlTablo(['Tarih/Saat', 'Daire', 'Tip', 'Sakin'],
                geceLogs.map(l => [formatDateTime(l.timestamp), `${l.block}-${l.apartment_no}`, TIP_ETIKET[l.type] || l.type, l.resident_name || '-']));
        return { html: true, response: html };
    }

    // ── SON GİRİŞLER ──────────────────────────────────────
    if (icerir(q, ['son giris', 'son giriş', 'en son', 'son kayit', 'son kayıt', 'son hareketler', 'son aktivite'])) {
        const logs = await db.getEntryLogs(10, null);
        if (logs.length === 0) return { response: '📋 Giriş kaydı bulunamadı.' };
        const html = '<b>📋 Son 10 Giriş</b><br><br>' +
            htmlTablo(['Tarih/Saat', 'Daire', 'Tip', 'Ziyaretçi'],
                logs.map(l => [formatDateTime(l.timestamp), `${l.block}-${l.apartment_no}`, TIP_ETIKET[l.type] || l.type, l.visitor_name || '-']));
        return { html: true, response: html };
    }

    // ── YARDIM ────────────────────────────────────────────
    if (icerir(q, ['yardim', 'yardım', 'ne yapabilirsin', 'ne biliyorsun', 'komutlar', 'nasil kullanilir', 'nasıl kullanılır'])) {
        return {
            response: `🤖 Site Güvenlik Asistanı — Yapabileceklerim:\n\n📋 Giriş Sorgulama:\n  "Bugünkü girişleri göster"\n  "Dün B5'e kim geldi"\n  "Bu ay A10'a kaç giriş oldu"\n  "C23 daireyi özetle"\n\n📊 İstatistik:\n  "Bugün kaç giriş oldu"\n  "Bu hafta istatistik"\n  "Geçen ay raporu"\n  "En çok ziyaretçi alan daire"\n\n⏳ Onaylar:\n  "Bekleyen onaylar var mı"\n  "Yanıtsız misafirler"\n\n🚨 Güvenlik:\n  "Anormal giriş var mı"\n  "Gece girişleri"\n\n👤 Sakin:\n  "Ahmet Yılmaz hangi dairede"\n  "A5 ekle: Mehmet Kaya, 05551234567"\n\n📱 Sistem:\n  "WhatsApp durumu nedir"`
        };
    }

    // ── VARSAYILAN ────────────────────────────────────────
    return {
        response: `🤔 Anlayamadım. Şunları deneyebilirsiniz:\n\n📋 "Bugünkü girişleri göster"\n📊 "Bugün kaç giriş oldu"\n🏠 "B4 daireyi özetle"\n⏳ "Bekleyen onaylar var mı"\n🚨 "Anormal giriş var mı"\n👤 "Ahmet Yılmaz hangi dairede"\n❓ "Yardım" — tüm komutlar için`
    };
}

module.exports = { processQuery, parseDateFromQuery, formatDate };
