const { makeWASocket, useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion } = require('@whiskeysockets/baileys');
const { Boom } = require('@hapi/boom');
const http = require('http');

const PORT = process.env.PORT || 3000;
const PREFIX = '!';
const SESSION_DIR = './session';
const API_KEY = process.env.API_KEY || 'rahasia123';

let sockInstance = null;

const server = http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
  res.end(JSON.stringify({ status: 'ok', wa: !!sockInstance?.user }));
});
server.listen(PORT, () => console.log(`[HTTP] ${PORT}`));

async function startBot() {
  const { version } = await fetchLatestBaileysVersion();
  console.log('[BAILEYS] Version:', version.join('.'));

  const { state, saveCreds } = await useMultiFileAuthState(SESSION_DIR);

  const sock = makeWASocket({
    version,
    auth: state,
    printQRInTerminal: false,
    browser: ['Chrome', 'Linux', '22.04.4'],
    syncFullHistory: false,
    markOnlineOnConnect: false,
    defaultQueryTimeoutMs: 120000,
    emitOwnEvents: false,
  });

  sock.ev.on('connection.update', async ({ connection, lastDisconnect, qr }) => {
    if (qr) console.log('[QR] Scan QR');
    if (connection === 'close') {
      const should = (lastDisconnect?.error instanceof Boom)
        ? lastDisconnect.error.output.statusCode !== DisconnectReason.loggedOut
        : true;
      console.log('[RECONNECT]', should);
      if (should) setTimeout(startBot, 10000);
    } else if (connection === 'open') {
      console.log('[BOT] Connected!');
      sockInstance = sock;
    }
  });

  sock.ev.on('creds.update', saveCreds);

  sock.ev.on('messages.upsert', async ({ messages }) => {
    for (const msg of messages) {
      try {
        if (msg.key.fromMe) continue;
        const text = msg.message?.conversation || msg.message?.extendedTextMessage?.text || '';
        const from = msg.key.remoteJid;
        console.log('[MSG]', from, text);
        if (text.startsWith(PREFIX)) {
          const cmd = text.slice(1).trim().split(/\s+/)[0].toLowerCase();
          if (cmd === 'help' || cmd === 'menu') {
            await sock.sendMessage(from, { text: '🤖 Bot WA IG Downloader\n\n!ig <url> - Download IG\n!help - Menu' });
          }
        }
      } catch (e) { console.error('[MSG ERR]', e.message); }
    }
  });

  if (!sock.authState.creds.registered) {
    setTimeout(async () => {
      const num = process.env.PAIRING_NUMBER;
      if (num) {
        const code = await sock.requestPairingCode(num);
        console.log('[PAIR]', code);
      }
    }, 5000);
  }
}

startBot();
