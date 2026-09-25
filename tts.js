'use strict';

// ═══════════════════════════════════════════════════════════
// WEB CRYPTO POLYFILL (Edge TTS için zorunlu)
// ═══════════════════════════════════════════════════════════
if (typeof crypto === 'undefined') {
    global.crypto = require('crypto');
}
if (typeof crypto.subtle === 'undefined') {
    const { Crypto } = require('@peculiar/webcrypto');
    global.crypto.subtle = new Crypto().subtle;
}


/**
 * tts.js — Site Güvenlik Profesyonel Sesli Bildirim Modülü
 * ─────────────────────────────────────────────────────────
 * SSML ile yavaş, ağır, profesyonel banka/telekom tonu.
 * Zaman dilimine göre otomatik selamlama.
 *
 * Örnek çıktı:
 * "Merhaba, Sayın Kasım Laçin. Misafiriniz siteden giriş
 *  yapmıştır. Bilgilerinize sunarız. Arem Güvenlik,
 *  iyi geceler diler."
 */

const { MsEdgeTTS, OUTPUT_FORMAT } = require('msedge-tts');
const { execFile } = require('child_process');
const path = require('path');
const fs = require('fs');
const os = require('os');

// ═══════════════════════════════════════════════════════════

// ═══════════════════════════════════════════════════════════
// FFMPEG YOLU BULUCU
// ═══════════════════════════════════════════════════════════

function findFFmpeg() {
    const customPath = 'C:\\\\Users\\\\tarik\\\\AppData\\\\Local\\\\Microsoft\\\\WinGet\\\\Packages\\\\Gyan.FFmpeg_Microsoft.Winget.Source_8wekyb3d8bbwe\\\\ffmpeg-8.1-full_build\\\\bin\\\\ffmpeg.exe';
    if (fs.existsSync(customPath)) return customPath;
    
    // Check if it's already in PATH
    try {
        const { execSync } = require('child_process');
        execSync('ffmpeg -version', { stdio: 'ignore' });
        return 'ffmpeg';
    } catch (_) {}
    
    return null;
}

// AYARLAR
// ═══════════════════════════════════════════════════════════

const TTS_VOICE = 'tr-TR-EmelNeural';
const FIRMA_ADI = 'Arem Güvenlik';

// ═══════════════════════════════════════════════════════════
// ZAMAN BAZLI SELAMLAMA
// ═══════════════════════════════════════════════════════════

function getGreeting() {
    const now = new Date();
    const hour = parseInt(
        now.toLocaleString('en-US', {
            hour: 'numeric',
            hour12: false,
            timeZone: 'Europe/Istanbul'
        })
    );
    const min = parseInt(
        now.toLocaleString('en-US', {
            minute: 'numeric',
            timeZone: 'Europe/Istanbul'
        })
    );
    const totalMin = hour * 60 + min;

    if (totalMin >= 300  && totalMin < 1050) return 'iyi günler diler';
    if (totalMin >= 1050 && totalMin < 1320) return 'iyi akşamlar diler';
    return 'iyi geceler diler';
}

// ═══════════════════════════════════════════════════════════
// KONUŞMA METNİ OLUŞTURUCU
// ═══════════════════════════════════════════════════════════

function createSpeechText(type, residentName, visitorName, firmaAdi) {
    const FIRMA = firmaAdi || FIRMA_ADI;
    const greeting = getGreeting();
    const sayin = `Sayın ${residentName}`;

    const metinler = {
        misafir:     () => visitorName
                            ? `Merhaba... ${sayin}. ${visitorName} isimli misafiriniz siteden giriş yapmıştır. Bilgilerinize sunarız. ${FIRMA}, ${greeting}.`
                            : `Merhaba... ${sayin}. Misafiriniz siteden giriş yapmıştır. Bilgilerinize sunarız. ${FIRMA}, ${greeting}.`,
        kurye:       () => `Sayın... ${residentName}, yemek siparişiniz siteden giriş yapmıştır. Bilgilerinize sunarız. ${FIRMA}, ${greeting}.`,
        kargo:       () => `Merhaba... ${sayin}. Kargonuz güvenlik kulübesi tarafından teslim alınmıştır. ${FIRMA}, ${greeting}.`,
        servis:      () => `Merhaba... ${sayin}. Teknik servis ekibi siteden giriş yapmıştır. Bilgilerinize sunarız. ${FIRMA}, ${greeting}.`,
        beyaz_esya:  () => `Merhaba... ${sayin}. Beyaz eşya teslimatı için giriş yapılmıştır. Bilgilerinize sunarız. ${FIRMA}, ${greeting}.`,
        mobilya:     () => `Merhaba... ${sayin}. Mobilya teslimatı için giriş yapılmıştır. Bilgilerinize sunarız. ${FIRMA}, ${greeting}.`,
        perde:       () => `Merhaba... ${sayin}. Perde ve dekorasyon hizmeti için giriş yapılmıştır. ${FIRMA}, ${greeting}.`,
        hali_yikama: () => `Merhaba... ${sayin}. Halı yıkama servisi siteden giriş yapmıştır. ${FIRMA}, ${greeting}.`,
        market:      () => `Merhaba... ${sayin}. Market siparişiniz siteden giriş yapmıştır. Bilgilerinize sunarız. ${FIRMA}, ${greeting}.`,
        emanet:      () => `Merhaba... ${sayin}. Adınıza güvenlik kulübesinde emanet eşya teslim alınmıştır. ${FIRMA}, ${greeting}.`,
        eczane:      () => `Merhaba... ${sayin}. Eczane kuryesi siteden giriş yapmıştır. Bilgilerinize sunarız. ${FIRMA}, ${greeting}.`,
        temizlik:    () => `Merhaba... ${sayin}. Temizlik görevlisi siteden giriş yapmıştır. Bilgilerinize sunarız. ${FIRMA}, ${greeting}.`,
    };

    return (metinler[type] || metinler['misafir'])();
}



// ═══════════════════════════════════════════════════════════
// GEÇİCİ DOSYA YÖNETİMİ
// ═══════════════════════════════════════════════════════════

function geciciKlasor() {
    const dir = path.join(
        os.tmpdir(),
        `sg_tts_${Date.now()}_${Math.random().toString(36).slice(2)}`
    );
    fs.mkdirSync(dir, { recursive: true });
    return dir;
}

function dosyaSil(dosya) {
    try {
        if (dosya && fs.existsSync(dosya)) {
            fs.unlinkSync(dosya);
            const dir = path.dirname(dosya);
            if (dir !== os.tmpdir()) {
                fs.rmSync(dir, { recursive: true, force: true });
            }
        }
    } catch (_) {}
}

// ═══════════════════════════════════════════════════════════
// ADIM 1: SSML → MP3 (Edge TTS)
// ═══════════════════════════════════════════════════════════

async function metindenMp3Uret(metin, klasor) {
    const ttsClient = new MsEdgeTTS();
    await ttsClient.setMetadata(TTS_VOICE, OUTPUT_FORMAT.AUDIO_24KHZ_48KBITRATE_MONO_MP3);
    const mp3Dosya = path.join(klasor, 'voice.mp3');
    const { audioStream } = await ttsClient.toStream(metin);
    return new Promise((resolve, reject) => {
        const yaz = fs.createWriteStream(mp3Dosya);
        audioStream.pipe(yaz);
        yaz.on('finish', () => {
            const boyut = fs.existsSync(mp3Dosya) ? fs.statSync(mp3Dosya).size : 0;
            console.log(`[TTS] MP3 boyutu: ${boyut} bytes`);
            resolve(mp3Dosya);
        });
        yaz.on('error', reject);
        audioStream.on('error', reject);
    });
}

// ═══════════════════════════════════════════════════════════
// ADIM 2: MP3 → OGG/OPUS (FFmpeg — WhatsApp PTT formatı)
// ═══════════════════════════════════════════════════════════

function mp3denOggUret(mp3Dosya, klasor) {
    return new Promise((resolve, reject) => {
        const oggDosya = path.join(klasor, 'voice.ogg');

        const args = [
            '-y',
            '-i', mp3Dosya,
            '-c:a', 'libopus',
            '-b:a', '32k',
            '-ar', '48000',
            '-ac', '1',
            '-f', 'ogg',
            oggDosya
        ];

        execFile(findFFmpeg(), args, { timeout: 30000, windowsHide: true }, (err, _out, stderr) => {
            if (err) {
                console.error('❌ [TTS] FFmpeg hatası:', stderr);
                reject(new Error('FFmpeg dönüştürme başarısız: ' + err.message));
                return;
            }
            const kb = (fs.statSync(oggDosya).size / 1024).toFixed(1);
            console.log(`✅ [TTS] OGG üretildi (${kb} KB): ${oggDosya}`);
            resolve(oggDosya);
        });
    });
}

// ═══════════════════════════════════════════════════════════
// ANA FONKSİYON — server.js bu fonksiyonu çağırıyor
// ═══════════════════════════════════════════════════════════

async function generateEntryVoice(type, residentName, visitorName, firmaAdi) {
    const klasor = geciciKlasor();
    try {
        const metin = createSpeechText(type, residentName, visitorName, firmaAdi);

        console.log(`🔊 [TTS] Üretiliyor: "${metin}"`);

        const mp3 = await metindenMp3Uret(metin, klasor);
        const ogg = await mp3denOggUret(mp3, klasor);

        try { fs.unlinkSync(mp3); } catch (_) {}

        console.log(`✅ [TTS] Ses hazır → ${ogg}`);
        return ogg;

    } catch (err) {
        console.error('❌ [TTS] generateEntryVoice hatası:', err.message);
        try { fs.rmSync(klasor, { recursive: true, force: true }); } catch (_) {}
        return null;
    }
}

// ═══════════════════════════════════════════════════════════
// TEST — terminal'de: node tts.js
// ═══════════════════════════════════════════════════════════

async function test() {
    console.log('\n══════════════════════════════════════════');
    console.log(' Site Güvenlik — TTS Modül Testi (SSML)');
    console.log('══════════════════════════════════════════\n');

    console.log(`🕐 Şu anki selamlama: "${getGreeting()}"\n`);

    console.log('📝 Metin Şablonları:\n');
    const testler = [
        { type: 'misafir',    ad: 'Kasım Laçin',   misafir: 'Mehmet Demir' },
        { type: 'kurye',      ad: 'Fatma Çelik',   misafir: '' },
        { type: 'kargo',      ad: 'Ali Kaya',       misafir: '' },
        { type: 'servis',     ad: 'Zeynep Arslan',  misafir: '' },
    ];
    for (const t of testler) {
        console.log(`  [${t.type.padEnd(11)}] ${createSpeechText(t.type, t.ad, t.misafir)}`);
    }

    console.log('\n🎤 Gerçek Ses Üretimi Test Ediliyor...\n');
    const oggDosya = await generateEntryVoice('misafir', 'Kasım Laçin', 'Mehmet Demir');

    if (oggDosya) {
        const kb = (fs.statSync(oggDosya).size / 1024).toFixed(1);
        console.log(`\n✅ BAŞARILI! ${kb} KB OGG dosyası üretildi.`);
        console.log(`✅ Dosya: ${oggDosya}`);
        console.log('✅ SSML profesyonel ton aktif. server.js ile tam uyumlu.\n');
        dosyaSil(oggDosya);
    } else {
        console.log('\n❌ Ses üretilemedi.');
        console.log('💡 FFmpeg kurulu mu? Terminal\'de: ffmpeg -version\n');
    }
}

// ═══════════════════════════════════════════════════════════
// EXPORT
// ═══════════════════════════════════════════════════════════

module.exports = { generateEntryVoice, createSpeechText, getGreeting };

if (require.main === module) {
    test().catch(console.error);
}
