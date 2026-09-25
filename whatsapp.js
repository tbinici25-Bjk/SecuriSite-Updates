// whatsapp.js — Baileys 7.x + Pairing Code (numarayla giriş)
// QR VE numara ile giriş birlikte destekleniyor.
// Anket şifre çözme dahil.

const qrcode = require('qrcode');
const path = require('path');
const fs = require('fs');

let sock = null;
let qrCodeDataUrl = null;
let pairingCode = null;
let isReady = false;
let statusMessage = 'Bağlantı bekleniyor...';
let onConfirmationCallback = null;
let reconnectTimer = null;
let isLoggedOut = false;
let B = null;
let pairingPhone = null;      // Pairing için telefon
let pairingRequested = false; // Kod bir kez istendi mi

const pendingPolls = [];
const messageStore = new Map();

const silentLogger = {
    level: 'silent',
    trace: () => {}, debug: () => {}, info: () => {},
    warn: () => {}, error: () => {}, fatal: () => {},
    child: () => silentLogger
};

async function loadBaileys() {
    if (B) return B;
    B = await import('@whiskeysockets/baileys');
    return B;
}

function getStatus() {
    return { isReady, statusMessage, hasQR: !!qrCodeDataUrl, pairingCode };
}

function getQR() { return qrCodeDataUrl; }

function formatPhone(phone) {
    let cleaned = phone.replace(/[\s\-\(\)]/g, '');
    if (cleaned.startsWith('+')) cleaned = cleaned.substring(1);
    if (cleaned.startsWith('0')) cleaned = '90' + cleaned.substring(1);
    if (!cleaned.startsWith('90')) cleaned = '90' + cleaned;
    return cleaned + '@s.whatsapp.net';
}

function normalizePairingPhone(phone) {
    let cleaned = phone.replace(/[\s\-\(\)\+]/g, '');
    if (cleaned.startsWith('0')) cleaned = '90' + cleaned.substring(1);
    if (!cleaned.startsWith('90')) cleaned = '90' + cleaned;
    return cleaned;
}

function getAuthPath() {
    const envPath = process.env.SITE_GUVENLIK_AUTH_PATH;
    if (envPath) return path.join(envPath, 'baileys_auth');
    return path.join(__dirname, '.wwebjs_auth', 'baileys_auth');
}

async function initWhatsApp() {
    try {
        isLoggedOut = false;
        pairingRequested = false;
        if (reconnectTimer) { clearTimeout(reconnectTimer); reconnectTimer = null; }

        const Baileys = await loadBaileys();
        const {
            default: makeWASocket,
            useMultiFileAuthState,
            DisconnectReason,
            makeCacheableSignalKeyStore,
            fetchLatestBaileysVersion
        } = Baileys;

        const authPath = getAuthPath();
        if (!fs.existsSync(authPath)) fs.mkdirSync(authPath, { recursive: true });

        const { state, saveCreds } = await useMultiFileAuthState(authPath);
        const { version } = await fetchLatestBaileysVersion();

        const usePairing = !!pairingPhone && !state.creds.registered;
        console.log(`🔄 [WhatsApp] Baileys başlatılıyor... pairing=${usePairing}`);

        sock = makeWASocket({
            version,
            auth: {
                creds: state.creds,
                keys: makeCacheableSignalKeyStore(state.keys, silentLogger)
            },
            printQRInTerminal: false,
            logger: silentLogger,
            // Pairing için mobil browser identity
            browser: Baileys.Browsers.ubuntu('Chrome'),
            defaultQueryTimeoutMs: undefined,
            connectTimeoutMs: 60000,
            retryRequestDelayMs: 2000,
            maxMsgRetryCount: 3,
            markOnlineOnConnect: false,
            syncFullHistory: false,
            getMessage: async (key) => {
                const stored = messageStore.get(key.id);
                return stored || undefined;
            }
        });

        sock.ev.on('creds.update', saveCreds);

        // PAIRING CODE: bağlantı kurulmadan, kayıt yoksa kod iste
        if (usePairing && !pairingRequested) {
            pairingRequested = true;
            // Socket hazır olması için kısa bekleme
            setTimeout(async () => {
                try {
                    if (!sock || isReady) return;
                    console.log('🔑 [WhatsApp] Pairing kodu isteniyor:', pairingPhone);
                    const code = await sock.requestPairingCode(pairingPhone);
                    // Kodu 4-4 formatla (ABCD-EFGH)
                    pairingCode = code.length === 8 ? `${code.slice(0,4)}-${code.slice(4)}` : code;
                    qrCodeDataUrl = null;
                    statusMessage = 'Kodu WhatsApp\'a girin';
                    console.log('🔑 [WhatsApp] Pairing kodu:', pairingCode);
                } catch(e) {
                    console.error('❌ [WhatsApp] Pairing hatası:', e.message);
                    statusMessage = 'Kod alınamadı: ' + e.message;
                    pairingPhone = null; // QR moduna düş
                }
            }, 3000);
        }

        sock.ev.on('connection.update', async (update) => {
            const { connection, lastDisconnect, qr } = update;

            if (qr && !usePairing) {
                try {
                    qrCodeDataUrl = await qrcode.toDataURL(qr);
                    pairingCode = null;
                    statusMessage = 'QR kodu tarayın...';
                    isReady = false;
                    console.log('📱 [WhatsApp] QR kodu oluşturuldu.');
                } catch(e) {}
            }

            if (connection === 'open') {
                isReady = true;
                qrCodeDataUrl = null;
                pairingCode = null;
                pairingPhone = null;
                statusMessage = 'WhatsApp bağlı ✅';
                console.log('✅ [WhatsApp] Bağlantı kuruldu!');
                if (reconnectTimer) { clearTimeout(reconnectTimer); reconnectTimer = null; }
            }

            if (connection === 'close') {
                isReady = false;
                qrCodeDataUrl = null;
                const statusCode = lastDisconnect?.error?.output?.statusCode;
                console.log('⚠️ [WhatsApp] Bağlantı kesildi. Kod:', statusCode);

                if (statusCode === DisconnectReason.loggedOut || isLoggedOut) {
                    pairingCode = null;
                    statusMessage = 'Oturum kapatıldı. Yeniden bağlanın.';
                    try {
                        const ap = getAuthPath();
                        if (fs.existsSync(ap)) fs.rmSync(ap, { recursive: true, force: true });
                    } catch(_) {}
                    reconnectTimer = setTimeout(() => initWhatsApp(), 3000);
                    return;
                }

                if (statusCode === DisconnectReason.restartRequired) {
                    reconnectTimer = setTimeout(() => initWhatsApp(), 2000);
                    return;
                }

                statusMessage = 'Bağlantı kesildi, yeniden bağlanılıyor...';
                reconnectTimer = setTimeout(() => initWhatsApp(), 30000);
            }
        });

        sock.ev.on('messages.upsert', async ({ messages, type }) => {
            for (const msg of messages) {
                try {
                    if (msg.message?.pollCreationMessage ||
                        msg.message?.pollCreationMessageV2 ||
                        msg.message?.pollCreationMessageV3) {
                        if (msg.key?.id) messageStore.set(msg.key.id, msg.message);
                    }

                    if (msg.message?.pollUpdateMessage) {
                        await handlePollUpdate(msg);
                        continue;
                    }

                    if (type === 'notify' && !msg.key.fromMe) {
                        const body = (
                            msg.message?.conversation ||
                            msg.message?.extendedTextMessage?.text || ''
                        ).trim().toUpperCase();
                        if (body === 'EVET' || body === 'HAYIR') {
                            handleConfirmation(msg.key.remoteJid, body, msg.key.senderPn, null);
                        }
                    }
                } catch(e) {}
            }
        });

        console.log('✅ [WhatsApp] Baileys başlatıldı.');
        return sock;

    } catch(err) {
        console.error('❌ [WhatsApp] Başlatma hatası:', err.message);
        statusMessage = 'Başlatma hatası: ' + err.message;
        isReady = false;
        if (!reconnectTimer) reconnectTimer = setTimeout(() => initWhatsApp(), 30000);
    }
}

async function handlePollUpdate(msg) {
    try {
        const { decryptPollVote } = B;
        const crypto = require('crypto');

        const pollUpdate = msg.message.pollUpdateMessage;
        const creationKey = pollUpdate.pollCreationMessageKey;
        const pollMsgId = creationKey?.id;

        // Anket oluşturma mesajını depodan al
        const pollMsg = messageStore.get(pollMsgId);
        if (!pollMsg) {
            console.log('⚠️ [WhatsApp] Anket mesajı depoda yok:', pollMsgId);
            return;
        }

        // messageSecret (şifre anahtarı)
        const secretB64 = pollMsg.messageContextInfo?.messageSecret;
        if (!secretB64) {
            console.log('⚠️ [WhatsApp] messageSecret yok');
            return;
        }
        const pollEncKey = Buffer.isBuffer(secretB64)
            ? secretB64
            : Buffer.from(secretB64, 'base64');

        // Şifreli oy
        const vote = pollUpdate.vote;
        if (!vote?.encPayload || !vote?.encIv) {
            console.log('⚠️ [WhatsApp] Oy şifreli verisi yok');
            return;
        }

        // Kimlikler
        const meId = sock.user?.id || '';
        const meLid = sock.user?.lid || '';
        const voterRaw = msg.key.remoteJid || '';
        const voterAlt = msg.key.participant || msg.key.senderPn || '';

        // JID adaylarını hazırla (: sonrası ekleri hem koru hem temizle)
        const strip = (j) => j ? j.replace(/:\d+/, '') : j;

        const creatorAdaylari = [
            meLid, strip(meLid),
            meId, strip(meId),
            creationKey?.remoteJid, strip(creationKey?.remoteJid)
        ].filter(Boolean);

        const voterAdaylari = [
            voterRaw, strip(voterRaw),
            voterAlt, strip(voterAlt)
        ].filter(Boolean);

        // Anket seçeneklerinin hash'leri
        const pollOptions = pollMsg.pollCreationMessageV3?.options ||
                           pollMsg.pollCreationMessage?.options ||
                           pollMsg.pollCreationMessageV2?.options || [];
        const hashToName = {};
        for (const opt of pollOptions) {
            const name = opt.optionName || '';
            const h = crypto.createHash('sha256').update(name).digest('hex');
            hashToName[h] = name;
        }

        // Tüm kombinasyonları dene
        let choice = '';
        let cozuldu = false;
        for (const creator of creatorAdaylari) {
            if (cozuldu) break;
            for (const voter of voterAdaylari) {
                try {
                    const result = decryptPollVote(
                        { encPayload: vote.encPayload, encIv: vote.encIv },
                        { pollCreatorJid: creator, pollMsgId, pollEncKey, voterJid: voter }
                    );
                    const selected = (result.selectedOptions || []).map(o =>
                        Buffer.from(o).toString('hex')
                    );
                    for (const h of selected) {
                        if (hashToName[h]) {
                            choice = hashToName[h].trim().toUpperCase();
                            cozuldu = true;
                            console.log('✅ [WhatsApp] Sifre cozuldu. creator=' + creator + ' voter=' + voter + ' secim=' + choice);
                            break;
                        }
                    }
                    if (cozuldu) break;
                } catch(e) {
                    // Bu kombinasyon olmadi, sonrakini dene
                }
            }
        }

        if (!cozuldu || (choice !== 'EVET' && choice !== 'HAYIR')) {
            console.log('⚠️ [WhatsApp] Hicbir kombinasyon ile cozulemedi.');
            return;
        }

        handleConfirmation(msg.key.remoteJid, choice, msg.key.senderPn, pollMsgId);

    } catch(e) {
        console.error('❌ [WhatsApp] Poll decrypt hatasi:', e.message);
    }
}

function handleConfirmation(voterId, choice, senderPn, pollMsgId) {
    const threeHoursAgo = Date.now() - (3 * 60 * 60 * 1000);
    let normalizedVoter = '';
    if (senderPn) normalizedVoter = senderPn.replace(/\D/g, '').slice(-10);
    else if (voterId) normalizedVoter = voterId.replace(/\D/g, '').slice(-10);

    let matchedPoll = null;
    if (pollMsgId) matchedPoll = pendingPolls.find(p => p.pollMsgId === pollMsgId && !p.answered);
    if (!matchedPoll && normalizedVoter) {
        matchedPoll = pendingPolls.find(p => {
            if (p.answered || p.timestamp < threeHoursAgo) return false;
            return p.phone.replace(/\D/g, '').slice(-10) === normalizedVoter;
        });
    }
    if (!matchedPoll) matchedPoll = pendingPolls.find(p => !p.answered && p.timestamp > threeHoursAgo);
    if (!matchedPoll || !choice) return;

    matchedPoll.answered = true;
    console.log('🎊 [WhatsApp] ONAY:', matchedPoll.logId, '->', choice);
    if (onConfirmationCallback) onConfirmationCallback(matchedPoll.chatId, choice, matchedPoll.logId || null);
}

async function requestPairingCode(phone) {
    try {
        if (sock) { try { await sock.end(); } catch(_) {} sock = null; }
        isReady = false;
        qrCodeDataUrl = null;
        pairingCode = null;
        const authPath = getAuthPath();
        if (fs.existsSync(authPath)) fs.rmSync(authPath, { recursive: true, force: true });
        pairingPhone = normalizePairingPhone(phone);
        console.log('🔑 [WhatsApp] Pairing başlatılıyor:', pairingPhone);
        await initWhatsApp();
        return { success: true };
    } catch(err) {
        return { success: false, error: err.message };
    }
}

async function sendMessage(phone, message) {
    if (!isReady || !sock) return { success: false, error: 'WhatsApp bağlı değil' };
    try {
        const jid = formatPhone(phone);
        await sock.sendMessage(jid, { text: Buffer.from(message, 'utf8').toString('utf8') });
        return { success: true, chatId: jid };
    } catch(err) {
        return { success: false, error: err.message };
    }
}

async function sendVoiceMessage(phone, audioPath) {
    if (!isReady || !sock) return { success: false, error: 'WhatsApp bağlı değil' };
    try {
        const jid = formatPhone(phone);
        const buffer = fs.readFileSync(audioPath);
        await sock.sendMessage(jid, { audio: buffer, mimetype: 'audio/ogg; codecs=opus', ptt: true });
        try {
            fs.unlinkSync(audioPath);
            const dir = path.dirname(audioPath);
            if (dir !== require('os').tmpdir()) fs.rmSync(dir, { recursive: true, force: true });
        } catch(_) {}
        return { success: true };
    } catch(err) {
        return { success: false, error: err.message };
    }
}

async function sendPoll(phone, question, options, logId = null) {
    if (!isReady || !sock) return { success: false, error: 'WhatsApp bağlı değil' };
    try {
        const jid = formatPhone(phone);
        const sentMsg = await sock.sendMessage(jid, {
            poll: { name: question, values: options, selectableCount: 1 }
        });
        const pollMsgId = sentMsg?.key?.id;
        if (pollMsgId && sentMsg.message) messageStore.set(pollMsgId, sentMsg.message);
        pendingPolls.push({ chatId: jid, phone, timestamp: Date.now(), answered: false, logId, pollMsgId });
        const sixHoursAgo = Date.now() - (6 * 60 * 60 * 1000);
        while (pendingPolls.length > 0 && pendingPolls[0].timestamp < sixHoursAgo) {
            const old = pendingPolls.shift();
            if (old.pollMsgId) messageStore.delete(old.pollMsgId);
        }
        return { success: true };
    } catch(err) {
        return { success: false, error: err.message };
    }
}

async function logout() {
    if (!sock) return { success: false, error: 'İstemci başlatılmadı.' };
    try {
        isLoggedOut = true;
        if (reconnectTimer) { clearTimeout(reconnectTimer); reconnectTimer = null; }
        try { await sock.logout(); } catch(_) {}
        try { await sock.end(); } catch(_) {}
        isReady = false;
        qrCodeDataUrl = null;
        pairingCode = null;
        pairingPhone = null;
        statusMessage = 'Oturum kapatıldı.';
        messageStore.clear();
        const authPath = getAuthPath();
        if (fs.existsSync(authPath)) fs.rmSync(authPath, { recursive: true, force: true });
        setTimeout(() => initWhatsApp(), 2000);
        return { success: true };
    } catch(err) {
        return { success: false, error: err.message };
    }
}

function onConfirmation(callback) { onConfirmationCallback = callback; }

setInterval(async () => {
    if (!sock || !isReady) return;
    try { await sock.sendPresenceUpdate('unavailable'); }
    catch(e) {
        isReady = false;
        if (!reconnectTimer) reconnectTimer = setTimeout(() => initWhatsApp(), 5000);
    }
}, 5 * 60 * 1000);

module.exports = {
    initWhatsApp, getStatus, getQR, sendMessage, sendVoiceMessage,
    sendPoll, logout, onConfirmation, formatPhone, requestPairingCode
};
