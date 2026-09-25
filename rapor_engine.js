'use strict';

// ==================== RAPOR MOTORU ====================
// WhatsApp mesajı ve PDF rapor oluşturur
// server.js ve assistant_engine.js tarafından kullanılır

const path = require('path');
const fs = require('fs');
const os = require('os');

// ==================== TARİH YARDIMCILARI ====================

function formatDate(d) {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function formatDateTR(d) {
    return new Date(d).toLocaleDateString('tr-TR', {
        day: '2-digit', month: '2-digit', year: 'numeric'
    });
}

function formatDateTimeTR(ts) {
    try {
        return new Date(ts.replace(' ', 'T')).toLocaleString('tr-TR', {
            day: '2-digit', month: '2-digit', year: 'numeric',
            hour: '2-digit', minute: '2-digit',
            timeZone: 'Europe/Istanbul'
        });
    } catch (e) { return ts; }
}

// ==================== VERİ TOPLAMA ====================

async function getRaporData(db, startDate, endDate) {
    // Tüm logları getir ve filtrele
    const tumLogs = await db.getEntryLogs(5000, null);
    const logs = tumLogs.filter(l => {
        const logTarih = l.timestamp ? l.timestamp.substring(0, 10) : '';
        return logTarih >= startDate && logTarih <= endDate;
    });

    // Tip sayımları
    const tipSayilari = {};
    logs.forEach(l => {
        tipSayilari[l.type] = (tipSayilari[l.type] || 0) + 1;
    });

    // Daire bazlı sayımlar
    const daireSayilari = {};
    logs.forEach(l => {
        const key = `${l.block}-${l.apartment_no}`;
        if (!daireSayilari[key]) {
            daireSayilari[key] = { block: l.block, apt: l.apartment_no, sakin: l.resident_name, toplam: 0 };
        }
        daireSayilari[key].toplam++;
    });

    // En yoğun 10 daire
    const enYogunDaireler = Object.values(daireSayilari)
        .sort((a, b) => b.toplam - a.toplam)
        .slice(0, 10);

    // Günlük dağılım
    const gunlukDagilim = {};
    logs.forEach(l => {
        const gun = l.timestamp ? l.timestamp.substring(0, 10) : '';
        gunlukDagilim[gun] = (gunlukDagilim[gun] || 0) + 1;
    });

    // Onay istatistikleri (sadece misafir)
    const misafirLogs = logs.filter(l => l.type === 'misafir');
    const onayIstat = {
        toplam: misafirLogs.length,
        onaylandi: misafirLogs.filter(l => l.confirmation === 'EVET').length,
        reddedildi: misafirLogs.filter(l => l.confirmation === 'HAYIR').length,
        otomatik: misafirLogs.filter(l => l.confirmation === 'OTOMATİK ONAY').length,
        manuel: misafirLogs.filter(l => l.confirmation === 'MANUEL ONAY').length,
        bekliyor: misafirLogs.filter(l => l.confirmation === 'Bekliyor...' || !l.confirmation).length
    };

    // Site ayarları
    const settings = await db.getSettings();
    const siteName = settings.site_name || 'Site Güvenlik';

    return {
        logs, tipSayilari, enYogunDaireler,
        gunlukDagilim, onayIstat, siteName,
        startDate, endDate,
        toplam: logs.length
    };
}

// ==================== WHATSAPP MESAJI ====================

function createWhatsAppMessage(data) {
    const { tipSayilari, enYogunDaireler, onayIstat, siteName, startDate, endDate, toplam } = data;

    const TIP_ETIKET = {
        kurye: '🍕 Kurye', kargo: '📦 Kargo', misafir: '👤 Misafir',
        servis: '🛠️ Servis', beyaz_esya: '🚚 Beyaz Eşya', mobilya: '🛋️ Mobilya',
        hali_yikama: '🧺 Halı Yıkama', market: '🛒 Market',
        perde: '🧶 Perde', emanet: '🎁 Emanet'
    };

    const baslangic = formatDateTR(startDate);
    const bitis = formatDateTR(endDate);
    const donem = startDate === endDate ? baslangic : `${baslangic} - ${bitis}`;

    let msg = `📊 *SİTE GÜVENLİK RAPORU*\n`;
    msg += `📅 ${donem}\n`;
    msg += `🏢 ${siteName}\n`;
    msg += `━━━━━━━━━━━━━━━━━━━━━━\n\n`;

    msg += `*📈 GENEL ÖZET*\n`;
    msg += `Toplam Giriş: *${toplam}*\n`;

    Object.entries(tipSayilari)
        .sort((a, b) => b[1] - a[1])
        .forEach(([tip, sayi]) => {
            msg += `${TIP_ETIKET[tip] || tip}: ${sayi}\n`;
        });

    if (enYogunDaireler.length > 0) {
        msg += `\n*🏆 EN YOĞUN DAİRELER*\n`;
        enYogunDaireler.slice(0, 5).forEach((d, i) => {
            msg += `${i + 1}. ${d.block}-${d.apt}: ${d.toplam} giriş\n`;
        });
    }

    if (onayIstat.toplam > 0) {
        msg += `\n*✅ ONAY İSTATİSTİĞİ*\n`;
        msg += `Toplam Misafir: ${onayIstat.toplam}\n`;
        if (onayIstat.onaylandi > 0) msg += `✅ Onaylanan: ${onayIstat.onaylandi}\n`;
        if (onayIstat.reddedildi > 0) msg += `❌ Reddedilen: ${onayIstat.reddedildi}\n`;
        if (onayIstat.otomatik > 0) msg += `⏰ Otomatik Onay: ${onayIstat.otomatik}\n`;
        if (onayIstat.bekliyor > 0) msg += `⏳ Yanıtsız: ${onayIstat.bekliyor}\n`;
    }

    msg += `\n━━━━━━━━━━━━━━━━━━━━━━\n`;
    msg += `🛡️ *Arem Güvenlik*\n`;
    msg += `_${new Date().toLocaleString('tr-TR', { timeZone: 'Europe/Istanbul' })}_`;

    return msg;
}

// ==================== PDF OLUŞTURMA ====================

async function createPDF(data, dosyaYolu) {
    const { tipSayilari, enYogunDaireler, onayIstat, siteName,
        startDate, endDate, toplam, gunlukDagilim, logs } = data;

    const TIP_ETIKET = {
        kurye: 'Yemek Kuryesi', kargo: 'Kargo', misafir: 'Misafir',
        servis: 'Teknik Servis', beyaz_esya: 'Beyaz Eşya', mobilya: 'Mobilya',
        hali_yikama: 'Halı Yıkama', market: 'Market',
        perde: 'Perde', emanet: 'Emanet'
    };

    const baslangic = formatDateTR(startDate);
    const bitis = formatDateTR(endDate);
    const donem = startDate === endDate ? baslangic : `${baslangic} — ${bitis}`;
    const olusturmaTarihi = new Date().toLocaleString('tr-TR', { timeZone: 'Europe/Istanbul' });

    // Tip tablosu satırları
    const tipSatirlari = Object.entries(tipSayilari)
        .sort((a, b) => b[1] - a[1])
        .map(([tip, sayi]) => `
            <tr>
                <td>${TIP_ETIKET[tip] || tip}</td>
                <td class="sayi">${sayi}</td>
                <td class="sayi">${toplam > 0 ? Math.round(sayi / toplam * 100) : 0}%</td>
            </tr>
        `).join('');

    // Yoğun daireler tablosu
    const daireSatirlari = enYogunDaireler.map((d, i) => `
        <tr>
            <td class="sayi">${i + 1}</td>
            <td><strong>${d.block}-${d.apt}</strong></td>
            <td>${d.sakin || '-'}</td>
            <td class="sayi">${d.toplam}</td>
        </tr>
    `).join('');

    // Günlük dağılım tablosu (son 7 gün)
    const gunlukSatirlar = Object.entries(gunlukDagilim)
        .sort((a, b) => b[0].localeCompare(a[0]))
        .slice(0, 14)
        .map(([gun, sayi]) => `
            <tr>
                <td>${formatDateTR(gun)}</td>
                <td class="sayi">${sayi}</td>
                <td>
                    <div class="bar-container">
                        <div class="bar" style="width: ${Math.min(sayi * 5, 200)}px">${sayi}</div>
                    </div>
                </td>
            </tr>
        `).join('');

    const html = `<!DOCTYPE html>
<html lang="tr">
<head>
<meta charset="UTF-8">
<style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: 'Segoe UI', Arial, sans-serif; color: #2c3e50; background: #fff; padding: 0; }
    
    .header {
        background: linear-gradient(135deg, #1a1d27, #2d3148);
        color: white;
        padding: 32px 40px;
        display: flex;
        justify-content: space-between;
        align-items: center;
    }
    .header .logo { font-size: 28px; font-weight: 700; letter-spacing: 1px; }
    .header .logo span { color: #4f8cff; }
    .header .meta { text-align: right; font-size: 13px; opacity: 0.8; line-height: 1.8; }
    .header .donem { font-size: 16px; font-weight: 600; color: #4f8cff; margin-bottom: 4px; }

    .content { padding: 32px 40px; }

    .ozet-grid {
        display: grid;
        grid-template-columns: repeat(4, 1fr);
        gap: 16px;
        margin-bottom: 32px;
    }
    .ozet-kart {
        background: #f8f9fa;
        border: 1px solid #e9ecef;
        border-radius: 12px;
        padding: 20px;
        text-align: center;
        border-top: 4px solid #4f8cff;
    }
    .ozet-kart .deger { font-size: 36px; font-weight: 700; color: #4f8cff; }
    .ozet-kart .etiket { font-size: 12px; color: #6c757d; margin-top: 4px; text-transform: uppercase; letter-spacing: 0.5px; }

    .bolum { margin-bottom: 32px; }
    .bolum-baslik {
        font-size: 16px;
        font-weight: 700;
        color: #1a1d27;
        margin-bottom: 16px;
        padding-bottom: 8px;
        border-bottom: 2px solid #4f8cff;
        display: flex;
        align-items: center;
        gap: 8px;
    }

    table { width: 100%; border-collapse: collapse; font-size: 13px; }
    th {
        background: #1a1d27;
        color: white;
        padding: 10px 14px;
        text-align: left;
        font-weight: 600;
        font-size: 11px;
        text-transform: uppercase;
        letter-spacing: 0.5px;
    }
    td { padding: 9px 14px; border-bottom: 1px solid #f0f0f0; }
    tr:hover td { background: #f8f9ff; }
    .sayi { text-align: center; font-weight: 600; }

    .iki-sutun { display: grid; grid-template-columns: 1fr 1fr; gap: 24px; }

    .onay-grid {
        display: grid;
        grid-template-columns: repeat(3, 1fr);
        gap: 12px;
    }
    .onay-kart {
        padding: 16px;
        border-radius: 8px;
        text-align: center;
    }
    .onay-kart.yesil { background: #d4edda; border: 1px solid #c3e6cb; }
    .onay-kart.kirmizi { background: #f8d7da; border: 1px solid #f5c6cb; }
    .onay-kart.sari { background: #fff3cd; border: 1px solid #ffeeba; }
    .onay-kart .deger { font-size: 28px; font-weight: 700; }
    .onay-kart.yesil .deger { color: #155724; }
    .onay-kart.kirmizi .deger { color: #721c24; }
    .onay-kart.sari .deger { color: #856404; }
    .onay-kart .etiket { font-size: 11px; margin-top: 4px; }

    .bar-container { display: flex; align-items: center; }
    .bar {
        background: #4f8cff;
        height: 18px;
        border-radius: 4px;
        min-width: 4px;
        display: flex;
        align-items: center;
        justify-content: flex-end;
        padding-right: 6px;
        font-size: 10px;
        color: white;
        font-weight: 600;
    }

    .footer {
        background: #f8f9fa;
        border-top: 1px solid #e9ecef;
        padding: 20px 40px;
        display: flex;
        justify-content: space-between;
        align-items: center;
        font-size: 11px;
        color: #6c757d;
    }

    @media print {
        body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    }
</style>
</head>
<body>

<div class="header">
    <div>
        <div class="logo">🏢 <span>Site Güvenlik</span></div>
        <div style="font-size:13px; margin-top:6px; opacity:0.8">${siteName}</div>
    </div>
    <div class="meta">
        <div class="donem">📅 ${donem}</div>
        <div>Oluşturulma: ${olusturmaTarihi}</div>
        <div>🛡️ Arem Güvenlik</div>
    </div>
</div>

<div class="content">

    <!-- ÖZET KARTLAR -->
    <div class="ozet-grid">
        <div class="ozet-kart">
            <div class="deger">${toplam}</div>
            <div class="etiket">Toplam Giriş</div>
        </div>
        <div class="ozet-kart">
            <div class="deger">${tipSayilari.misafir || 0}</div>
            <div class="etiket">Misafir</div>
        </div>
        <div class="ozet-kart">
            <div class="deger">${(tipSayilari.kurye || 0) + (tipSayilari.kargo || 0) + (tipSayilari.market || 0)}</div>
            <div class="etiket">Kurye / Kargo</div>
        </div>
        <div class="ozet-kart">
            <div class="deger">${onayIstat.onaylandi}</div>
            <div class="etiket">Onaylanan Misafir</div>
        </div>
    </div>

    <div class="iki-sutun">

        <!-- GİRİŞ TİPLERİ -->
        <div class="bolum">
            <div class="bolum-baslik">📊 Giriş Tipleri</div>
            <table>
                <thead><tr><th>Tip</th><th>Sayı</th><th>Oran</th></tr></thead>
                <tbody>${tipSatirlari || '<tr><td colspan="3" style="text-align:center;padding:20px">Veri yok</td></tr>'}</tbody>
            </table>
        </div>

        <!-- ONAY İSTATİSTİĞİ -->
        <div class="bolum">
            <div class="bolum-baslik">✅ Misafir Onay Durumu</div>
            ${onayIstat.toplam > 0 ? `
            <div class="onay-grid">
                <div class="onay-kart yesil">
                    <div class="deger">${onayIstat.onaylandi}</div>
                    <div class="etiket">Onaylandı</div>
                </div>
                <div class="onay-kart kirmizi">
                    <div class="deger">${onayIstat.reddedildi}</div>
                    <div class="etiket">Reddedildi</div>
                </div>
                <div class="onay-kart sari">
                    <div class="deger">${onayIstat.bekliyor + onayIstat.otomatik}</div>
                    <div class="etiket">Yanıtsız / Oto</div>
                </div>
            </div>
            ` : '<p style="color:#6c757d;padding:20px;text-align:center">Bu dönemde misafir girişi yok.</p>'}
        </div>

    </div>

    <!-- EN YOĞUN DAİRELER -->
    ${enYogunDaireler.length > 0 ? `
    <div class="bolum">
        <div class="bolum-baslik">🏆 En Yoğun Daireler</div>
        <table>
            <thead><tr><th>#</th><th>Daire</th><th>Sakin</th><th>Giriş Sayısı</th></tr></thead>
            <tbody>${daireSatirlari}</tbody>
        </table>
    </div>
    ` : ''}

    <!-- GÜNLÜK DAĞILIM -->
    ${gunlukSatirlar ? `
    <div class="bolum">
        <div class="bolum-baslik">📅 Günlük Dağılım</div>
        <table>
            <thead><tr><th>Tarih</th><th>Giriş</th><th>Dağılım</th></tr></thead>
            <tbody>${gunlukSatirlar}</tbody>
        </table>
    </div>
    ` : ''}

</div>

<div class="footer">
    <div>Site Güvenlik Yönetim Sistemi — Arem Güvenlik</div>
    <div>Rapor Tarihi: ${olusturmaTarihi}</div>
</div>

</body>
</html>`;

    // Puppeteer ile PDF oluştur
    let puppeteer;
    try {
        puppeteer = require('puppeteer');
    } catch (e) {
        try {
            puppeteer = require('puppeteer-core');
        } catch (e2) {
            throw new Error('Puppeteer bulunamadı. PDF oluşturulamıyor.');
        }
    }

    const browser = await puppeteer.launch({
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-gpu']
    });

    try {
        const page = await browser.newPage();
        await page.setContent(html, { waitUntil: 'networkidle0' });
        await page.pdf({
            path: dosyaYolu,
            format: 'A4',
            printBackground: true,
            margin: { top: '0', right: '0', bottom: '0', left: '0' }
        });
    } finally {
        await browser.close();
    }

    return dosyaYolu;
}

// ==================== ANA RAPOR FONKSİYONU ====================

async function createRapor(db, wa, startDate, endDate, options = {}) {
    const { whatsappPhone, pdfMasaustu, pdfYol } = options;

    const data = await getRaporData(db, startDate, endDate);
    const results = { whatsapp: null, pdf: null };

    // WhatsApp gönderimi
    if (whatsappPhone) {
        const mesaj = createWhatsAppMessage(data);
        results.whatsapp = await wa.sendMessage(whatsappPhone, mesaj);
    }

    // PDF oluşturma
    if (pdfMasaustu || pdfYol) {
        const donem = startDate === endDate ? startDate : `${startDate}_${endDate}`;
        const dosyaAdi = `Site_Guvenlik_Raporu_${donem}.pdf`;

        let hedefYol;
        if (pdfYol) {
            hedefYol = pdfYol;
        } else {
            // Masaüstü yolu
            const masaustu = path.join(os.homedir(), 'Desktop');
            hedefYol = path.join(masaustu, dosyaAdi);
        }

        await createPDF(data, hedefYol);
        results.pdf = hedefYol;
    }

    return { data, results };
}

module.exports = { createRapor, createWhatsAppMessage, createPDF, getRaporData };
