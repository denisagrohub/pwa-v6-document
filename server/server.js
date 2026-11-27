/* PDF Compilatore — backend di invio email via SMTP.
 * Serve i file statici della PWA e l'endpoint POST /api/send. */
'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');
const nodemailer = require('nodemailer');

const PORT = process.env.PORT || 8787;
const STATIC_DIR = path.join(__dirname, '..');
const MAX_BODY = 25 * 1024 * 1024;

const SMTP_HOST = process.env.SMTP_HOST;
const SMTP_PORT = Number(process.env.SMTP_PORT || 587);
const SMTP_SECURE = process.env.SMTP_SECURE ? process.env.SMTP_SECURE === 'true' : SMTP_PORT === 465;
const SMTP_USER = process.env.SMTP_USER;
const SMTP_PASS = process.env.SMTP_PASS;
const SMTP_FROM = process.env.SMTP_FROM || SMTP_USER;

if (!SMTP_HOST || !SMTP_USER || !SMTP_PASS) {
  console.error('Configurazione SMTP mancante: imposta SMTP_HOST, SMTP_USER, SMTP_PASS (vedi .env.example).');
}

const transporter = nodemailer.createTransport({
  host: SMTP_HOST,
  port: SMTP_PORT,
  secure: SMTP_SECURE,
  auth: SMTP_USER && SMTP_PASS ? { user: SMTP_USER, pass: SMTP_PASS } : undefined
});

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon'
};

function sendJson(res, status, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body)
  });
  res.end(body);
}

function serveStatic(req, res) {
  let urlPath = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  if (urlPath === '/') urlPath = '/index.html';
  const filePath = path.normalize(path.join(STATIC_DIR, urlPath));
  if (!filePath.startsWith(STATIC_DIR)) {
    return sendJson(res, 403, { error: 'Percorso non consentito' });
  }
  fs.readFile(filePath, (err, data) => {
    if (err) return sendJson(res, 404, { error: 'Non trovato' });
    res.writeHead(200, {
      'Content-Type': MIME[path.extname(filePath).toLowerCase()] || 'application/octet-stream',
      'Cache-Control': urlPath.startsWith('/icons/') ? 'public, max-age=604800' : 'no-cache'
    });
    res.end(data);
  });
}

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > MAX_BODY) {
        reject(new Error('Payload troppo grande'));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')));
      } catch (_) {
        reject(new Error('JSON non valido'));
      }
    });
    req.on('error', reject);
  });
}

function validEmail(value) {
  return typeof value === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

async function handleSend(req, res) {
  let payload;
  try {
    payload = await readJsonBody(req);
  } catch (err) {
    return sendJson(res, 400, { error: err.message });
  }

  const to = payload.to;
  const subject = typeof payload.subject === 'string' && payload.subject.trim()
    ? payload.subject.trim()
    : 'Moduli PDF compilati';
  const body = typeof payload.body === 'string' ? payload.body : '';
  const attachments = Array.isArray(payload.attachments) ? payload.attachments : [];

  if (!validEmail(to)) return sendJson(res, 400, { error: 'Destinatario non valido' });
  if (!attachments.length) return sendJson(res, 400, { error: 'Nessun PDF allegato' });
  for (const a of attachments) {
    if (!a || !/\.pdf$/i.test(String(a.filename || '')) || !/^[A-Za-z0-9+/=\r\n]+$/.test(String(a.content || ''))) {
      return sendJson(res, 400, { error: 'Allegato non valido: ' + (a && a.filename) });
    }
  }

  const mail = {
    from: SMTP_FROM,
    to,
    subject,
    text: body,
    attachments: attachments.map((a) => ({
      filename: String(a.filename),
      content: Buffer.from(String(a.content), 'base64'),
      contentType: 'application/pdf'
    }))
  };

  try {
    const info = await transporter.sendMail(mail);
    console.log(`Email inviata a ${to}: ${info.messageId} (${attachments.length} allegati)`);
    sendJson(res, 200, { ok: true, messageId: info.messageId });
  } catch (err) {
    console.error('Invio fallito:', err.message);
    sendJson(res, 502, { error: 'Invio SMTP fallito: ' + err.message });
  }
}

const server = http.createServer((req, res) => {
  const pathname = new URL(req.url, 'http://x').pathname;
  if (req.method === 'GET' && pathname === '/api/health') {
    return sendJson(res, 200, { ok: true, smtp: !!(SMTP_HOST && SMTP_USER && SMTP_PASS) });
  }
  if (req.method === 'POST' && pathname === '/api/send') {
    return handleSend(req, res).catch((err) => sendJson(res, 500, { error: err.message }));
  }
  if (req.method === 'GET') return serveStatic(req, res);
  sendJson(res, 405, { error: 'Metodo non consentito' });
});

server.listen(PORT, () => {
  console.log(`PDF Compilatore server attivo su http://localhost:${PORT}`);
});
