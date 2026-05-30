import { makeWASocket, useMultiFileAuthState, DisconnectReason } from '@whiskeysockets/baileys';
import { Boom } from '@hapi/boom';
import axios from 'axios';
import { load as cheerioLoad } from 'cheerio';
import http from 'http';
import fs from 'fs';
import path from 'path';
import url from 'url';
import QRCode from 'qrcode-terminal';

// ---------- CONFIG ----------
const PORT = process.env.PORT || 3000;
const PREFIX = '!';
const SESSION_DIR = './session';
const API_KEY = process.env.API_KEY || 'rahasia123';

let sockInstance = null;
const messageLog = [];

// ---------- HTTP SERVER + REST API ----------
function parseJSON(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      try { resolve(body ? JSON.parse(body) : {}); }
      catch (e) { reject(new Error('Invalid JSON')); }
    });
    req.on('error', reject);
  });
}

function jsonResponse(res, status, data) {
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS'
  });
  res.end(JSON.stringify(data));
}

const server = http.createServer(async (req, res) => {
  const parsedUrl = url.parse(req.url, true);
  const pathname = parsedUrl.pathname;
  const method = req.method.toUpperCase();

  if (method === 'OPTIONS') {
    jsonResponse(res, 200, {});
    return;
  }

  const authHeader = req.headers['authorization'] || '';
  const reqApiKey = authHeader.replace('Bearer ', '') || parsedUrl.query.api_key || '';
  const isAuthenticated = reqApiKey === API_KEY;

  try {
    if (pathname === '/' && method === 'GET') {
      jsonResponse(res, 200, {
        status: 'ok',
        bot: 'BotWA IG Downloader',
        wa_connected: sockInstance ? !!sockInstance.user : false,
        timestamp: new Date().toISOString()
      });
      return;
    }

    if (pathname === '/api/send' && method === 'POST') {
      if (!isAuthenticated) {
        jsonResponse(res, 401, { error: 'Unauthorized. Gunakan header Authorization: Bearer <API_KEY>' });
        return;
      }
      if (!sockInstance || !sockInstance.user) {
        jsonResponse(res, 503, { error: 'WhatsApp belum terhubung' });
        return;
      }

      const body = await parseJSON(req);
      const { to, message, type } = body;

      if (!to || !message) {
        jsonResponse(res, 400, { error: 'Parameter "to" dan "message" wajib diisi' });
        return;
      }

      messageLog.push({ to, message, type: type || 'text', status: 'sending', time: new Date().toISOString() });

      const jid = to.includes('@s.whatsapp.net') ? to : `${to}@s.whatsapp.net`;
      const msgType = type === 'image' ? 'image' : type === 'video' ? 'video' : 'text';

      if (msgType === 'text') {
        await sockInstance.sendMessage(jid, { text: message });
      } else {
        await sockInstance.sendMessage(jid, { [msgType]: { url: message } });
      }

      messageLog[messageLog.length - 1].status = 'sent';
      jsonResponse(res, 200, { success: true, to: jid, type: msgType, log_id: messageLog.length - 1 });
      return;
    }

    if (pathname === '/api/broadcast' && method === 'POST') {
      if (!isAuthenticated) {
        jsonResponse(res, 401, { error: 'Unauthorized' });
        return;
      }
      if (!sockInstance || !sockInstance.user) {
        jsonResponse(res, 503, { error: 'WhatsApp belum terhubung' });
        return;
      }

      const body = await parseJSON(req);
      const { to, message } = body;

      if (!to || !Array.isArray(to) || to.length === 0 || !message) {
        jsonResponse(res, 400, { error: 'Parameter "to" (array) dan "message" wajib diisi' });
        return;
      }

      const results = [];
      for (const target of to) {
        try {
          const jid = target.includes('@s.whatsapp.net') ? target : `${target}@s.whatsapp.net`;
          await sockInstance.sendMessage(jid, { text: message });
          results.push({ to: target, status: 'sent' });
          messageLog.push({ to: target, message, type: 'text', status: 'sent', time: new Date().toISOString() });
        } catch (e) {
          results.push({ to: target, status: 'failed', error: e.message });
        }
      }

      jsonResponse(res, 200, { success: true, results });
      return;
    }

    if (pathname === '/api/logs' && method === 'GET') {
      if (!isAuthenticated) {
        jsonResponse(res, 401, { error: 'Unauthorized' });
        return;
      }
      const limit = parseInt(parsedUrl.query.limit) || 50;
      jsonResponse(res, 200, { logs: messageLog.slice(-limit), total: messageLog.length });
      return;
    }

    jsonResponse(res, 404, { error: 'Not found' });
  } catch (e) {
    console.error('[API ERROR]', e.message);
    jsonResponse(res, 500, { error: e.message });
  }
});

server.listen(PORT, () => {
  console.log(`[HTTP] API Server running on port ${PORT}`);
});

// ---------- INSTAGRAM DOWNLOADER ----------
async function downloadInstagram(url) {
  try {
    const result = await scrapIndown(url);
    if (result) return result;
    const result2 = await scrapSnapinsta(url);
    if (result2) return result2;
    return null;
  } catch (e) {
    console.error('[IG] All sources failed:', e.message);
    return null;
  }
}

async function scrapIndown(url) {
  try {
    const { data } = await axios.post('https://indown.io/api', new URLSearchParams({
      link: url,
      lang: 'en'
    }), {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      },
      timeout: 15000
    });

    if (data && data.medias && data.medias.length > 0) {
      const media = data.medias[0];
      return {
        type: media.extension === 'mp4' ? 'video' : 'image',
        url: media.url,
        thumbnail: data.thumbnail || '',
        caption: data.title || ''
      };
    }
    return null;
  } catch (e) {
    return null;
  }
}

async function scrapSnapinsta(url) {
  try {
    const { data: html } = await axios.get('https://snapinsta.app/id', {
      headers: { 'User-Agent': 'Mozilla/5.0' }
    });
    const $ = cheerioLoad(html);
    const token = $('input[name="token"]').val() || '';

    const { data } = await axios.post('https://snapinsta.app/action2', new URLSearchParams({
      url,
      token,
      lang: 'id'
    }), {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'User-Agent': 'Mozilla/5.0'
      },
      timeout: 15000
    });

    if (data && data.medias && data.medias.length > 0) {
      const media = data.medias[0];
      return {
        type: media.extension === 'mp4' ? 'video' : 'image',
        url: media.url,
        thumbnail: data.thumbnail || '',
        caption: data.title || ''
      };
    }
    return null;
  } catch (e) {
    return null;
  }
}

async function mediaToBuffer(url) {
  const resp = await axios.get(url, {
    responseType: 'arraybuffer',
    timeout: 30000,
    headers: { 'User-Agent': 'Mozilla/5.0' }
  });
  return Buffer.from(resp.data);
}

// ---------- WHATSAPP BOT ----------
async function startBot() {
  const { state, saveCreds } = await useMultiFileAuthState(SESSION_DIR);

  const sock = makeWASocket({
    auth: state,
    printQRInTerminal: false,
    browser: ['Ubuntu', 'Chrome', '22.04.4'],
    defaultQueryTimeoutMs: 60000,
  });

  if (!sock.authState.creds.registered) {
    setTimeout(async () => {
      const phoneNumber = process.env.PAIRING_NUMBER || '';
      if (phoneNumber) {
        const code = await sock.requestPairingCode(phoneNumber);
        console.log(`[PAIRING CODE]: ${code}`);
      }
    }, 3000);
  }

  sock.ev.on('connection.update', ({ connection, lastDisconnect, qr }) => {
    if (qr) {
      QRCode.generate(qr, { small: true });
      console.log('[QR] Scan QR di atas dengan WhatsApp Anda');
    }
    if (connection === 'close') {
      const shouldReconnect = (lastDisconnect?.error instanceof Boom)
        ? lastDisconnect.error.output.statusCode !== DisconnectReason.loggedOut
        : true;
      console.log('[BOT] Disconnected, reconnecting:', shouldReconnect);
      if (shouldReconnect) startBot();
    } else if (connection === 'open') {
      console.log('[BOT] WhatsApp connected!');
      sockInstance = sock;
    }
  });

  sock.ev.on('creds.update', saveCreds);

  sock.ev.on('messages.upsert', async ({ messages }) => {
    try {
      for (const msg of messages) {
        if (!msg.key.fromMe && msg.message) {
          const text = msg.message.conversation
            || msg.message.extendedTextMessage?.text
            || '';
          const from = msg.key.remoteJid;

          if (text.startsWith(PREFIX)) {
          const [cmd, ...args] = text.slice(PREFIX.length).trim().split(/\s+/);
          const arg = args.join(' ');

          switch (cmd.toLowerCase()) {
            case 'ig':
            case 'instagram':
            case 'igdl':
              if (!arg) {
                await sock.sendMessage(from, {
                  text: `Cara pakai: ${PREFIX}ig <url_instagram>\n\nContoh: ${PREFIX}ig https://www.instagram.com/p/ABC123/`
                });
                return;
              }
              await handleInstagram(sock, from, arg);
              break;

            case 'help':
            case 'menu':
              await sock.sendMessage(from, {
                text: `🤖 *Bot WA Instagram Downloader*\n\n` +
                      `📌 *Command:*\n` +
                      `• ${PREFIX}ig <url> - Download IG post/reel\n` +
                      `• ${PREFIX}help - Tampilkan menu ini\n\n` +
                      `💡 *Contoh:*\n${PREFIX}ig https://www.instagram.com/p/ABC123/`
              });
              break;

            default:
              await sock.sendMessage(from, {
                text: `Command tidak dikenal. Ketik ${PREFIX}help untuk bantuan.`
              });
          }
        }
      }
      }
    } catch (e) {
      console.error('[MSG HANDLER ERROR]', e.message);
    }
  });
}

async function handleInstagram(sock, from, url) {
  const igRegex = /(?:https?:\/\/)?(?:www\.)?(?:instagram\.com|instagr\.am)\/(p|reel|tv)\/([a-zA-Z0-9_-]+)/i;
  if (!igRegex.test(url.trim())) {
    await sock.sendMessage(from, {
      text: '❌ URL Instagram tidak valid. Masukkan URL post/reel Instagram yang benar.'
    });
    return;
  }

  await sock.sendMessage(from, { text: '⏳ Mendownload postingan Instagram...' });

  try {
    const result = await downloadInstagram(url.trim());
    if (!result || !result.url) {
      await sock.sendMessage(from, {
        text: '❌ Gagal mendapatkan media dari URL tersebut. Coba link lain.'
      });
      return;
    }

    await sock.sendMessage(from, { text: `📥 Mengirim ${result.type}...` });

    const buffer = await mediaToBuffer(result.url);

    if (result.type === 'video') {
      await sock.sendMessage(from, {
        video: buffer,
        caption: result.caption ? result.caption.slice(0, 100) : '📥 Dari Instagram'
      });
    } else {
      await sock.sendMessage(from, {
        image: buffer,
        caption: result.caption ? result.caption.slice(0, 100) : '📥 Dari Instagram'
      });
    }

    if (result.thumbnail && result.type === 'video') {
      try {
        const thumbBuf = await mediaToBuffer(result.thumbnail);
        await sock.sendMessage(from, { image: thumbBuf });
      } catch (_) {}
    }

  } catch (err) {
    console.error('[HANDLE_IG]', err.message);
    await sock.sendMessage(from, {
      text: '❌ Gagal mendownload. Coba lagi nanti.'
    });
  }
}

// ---------- RUN ----------
startBot().catch(err => {
  console.error('[FATAL]', err);
  process.exit(1);
});
