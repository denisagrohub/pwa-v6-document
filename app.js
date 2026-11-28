/* PDF Compilatore — PWA client */
'use strict';

const PDFLIB_URL = 'https://unpkg.com/pdf-lib@1.17.1/dist/pdf-lib.min.js';
const SIGNPAD_URL = 'https://unpkg.com/signature_pad@5/dist/signature_pad.umd.min.js';
const OTS_CALENDARS = [
  'https://a.pool.opentimestamps.org',
  'https://b.pool.opentimestamps.org',
  'https://ots.btc.catallaxy.com',
  'https://alice.btc.catallaxy.com'
];

const PROFILE_KEYS = [
  { key: 'nome', label: 'Nome' },
  { key: 'cognome', label: 'Cognome' },
  { key: 'email', label: 'Email' },
  { key: 'telefono', label: 'Telefono' },
  { key: 'indirizzo', label: 'Indirizzo' },
  { key: 'codicefiscale', label: 'Codice fiscale' },
  { key: 'datadinascita', label: 'Data di nascita' },
  { key: 'luogodinascita', label: 'Luogo di nascita' }
];

const LOADER_MESSAGES = [
  'Risveglio del server\u2026',
  'Il server gratuito si accende al primo utilizzo, un attimo\u2026',
  'Ancora un istante\u2026',
  'Quasi pronto\u2026'
];

const state = {
  pdfs: [],          // { name, bytes, size }
  questions: [],     // { pdfIndex, field: {name, type, options}, value, skipped }
  qIndex: 0,
  settings: {
    apiBase: '',
    recipient: '',
    subject: '',
    signature: '',
    profile: {},
    theme: { primary: '#4338ca', accent: '#d4af37' },
    signEnabled: true,
    otsEnabled: true,
    services: { pdf: true }
  },
  signTargets: [],
  signQueue: [],
  signQueueIndex: 0,
  signResults: {},
  signatureDone: false,
  signatureBytes: null,
  project: ''
};

/* ---------- servizi ---------- */

const SERVICES = [
  {
    id: 'pdf',
    name: 'PDF Compilatore',
    glyph: '\ud83d\udcc4',
    gradient: 'svc-indigo',
    available: true,
    hint: 'Compila moduli e invia via email'
  },
  {
    id: 'firma-remota',
    name: 'Firma remota',
    glyph: '\u270d\ufe0f',
    gradient: 'svc-gold',
    available: false,
    hint: 'In arrivo'
  },
  {
    id: 'scansione',
    name: 'Scansione documenti',
    glyph: '\ud83d\udcf7',
    gradient: 'svc-indigo',
    available: false,
    hint: 'In arrivo'
  },
  {
    id: 'rubrica',
    name: 'Rubrica destinatari',
    glyph: '\ud83d\udcd6',
    gradient: 'svc-gold',
    available: false,
    hint: 'In arrivo'
  }
];

function serviceEnabled(id) {
  return state.settings.services[id] !== false;
}

function renderServices() {
  const grid = $('services-grid');
  if (!grid) return;
  grid.innerHTML = '';
  const active = SERVICES.filter((s) => serviceEnabled(s.id));
  for (const s of active) {
    const tile = document.createElement('button');
    tile.className = 'service-tile';
    tile.type = 'button';
    const icon = document.createElement('span');
    icon.className = 'service-icon ' + (s.gradient || 'svc-indigo');
    icon.textContent = s.glyph;
    const label = document.createElement('span');
    label.className = 'service-label';
    label.textContent = s.name;
    tile.appendChild(icon);
    tile.appendChild(label);
    if (!s.available) {
      tile.disabled = true;
      tile.classList.add('service-soon');
      tile.title = 'Servizio in arrivo';
    }
    tile.addEventListener('click', () => openService(s));
    grid.appendChild(tile);
  }
  const pdfOn = serviceEnabled('pdf');
  $('card-pdf').classList.toggle('hidden', !pdfOn);
  $('archive-card').classList.toggle('hidden', !pdfOn);
}

function openService(s) {
  if (s.id === 'pdf') {
    const card = $('card-pdf');
    card.scrollIntoView({ behavior: 'smooth', block: 'start' });
    card.classList.remove('flash');
    requestAnimationFrame(() => card.classList.add('flash'));
  }
}

function renderServiceSettings() {
  const wrap = $('services-settings');
  if (!wrap) return;
  wrap.innerHTML = '';
  for (const s of SERVICES) {
    const row = document.createElement('label');
    row.className = 'check-row';
    const input = document.createElement('input');
    input.type = 'checkbox';
    input.checked = serviceEnabled(s.id);
    input.disabled = !s.available;
    input.addEventListener('change', () => {
      state.settings.services[s.id] = input.checked;
      saveSettings();
      renderServices();
    });
    const span = document.createElement('span');
    span.textContent = s.glyph + ' ' + s.name + (s.available ? '' : ' (in arrivo)');
    row.appendChild(input);
    row.appendChild(span);
    wrap.appendChild(row);
  }
}

/* ---------- helpers ---------- */

const $ = (id) => document.getElementById(id);

function show(screen) {
  for (const s of document.querySelectorAll('.screen')) s.classList.add('hidden');
  $('screen-' + screen).classList.remove('hidden');
  const titles = { home: 'PDF Compilatore', quiz: 'Compilazione', sign: 'Firma', email: 'Email di invio', settings: 'Impostazioni' };
  const titleText = $('title-text');
  if (titleText) titleText.textContent = titles[screen] || '';
  window.scrollTo(0, 0);
  if (screen === 'home') checkServerStatus();
}

async function checkServerStatus() {
  const pill = $('server-pill');
  const base = apiBase();
  if (!base) return;
  pill.classList.remove('hidden');
  pill.textContent = '\u23f3 Verifico il server\u2026';
  const standby = '\ud83d\udfe1 Server in standby: si accender\u00e0 al primo invio (fino a un minuto)';
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 6000);
    const res = await fetch(base + '/health', { signal: ctrl.signal });
    clearTimeout(t);
    const data = await res.json().catch(() => ({}));
    pill.textContent = res.ok && data.ok ? '\ud83d\udfe2 Server pronto per l\u2019invio' : standby;
  } catch (_) {
    pill.textContent = standby;
  }
}

function status(el, text, kind) {
  el.textContent = text;
  el.className = 'status ' + (kind || 'info');
  el.classList.remove('hidden');
}

function prettify(name) {
  return String(name)
    .replace(/[_.\-]+/g, ' ')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^./, (c) => c.toUpperCase());
}

function profileGuess(label) {
  const norm = label.toLowerCase().replace(/[^a-z]/g, '');
  for (const p of PROFILE_KEYS) {
    const v = state.settings.profile[p.key];
    if (v && norm.includes(p.key)) return v;
  }
  return '';
}

function loadScript(url, errText) {
  return new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = url;
    s.onload = resolve;
    s.onerror = () => reject(new Error(errText));
    document.head.appendChild(s);
  });
}

async function loadPdfLib() {
  if (window.PDFLib) return;
  await loadScript(PDFLIB_URL, 'Impossibile scaricare pdf-lib');
}

async function loadSignaturePad() {
  if (window.SignaturePad) return;
  await loadScript(SIGNPAD_URL, 'Impossibile scaricare la libreria firma');
}

async function sha256Hex(bytes) {
  try {
    const digest = await crypto.subtle.digest('SHA-256', bytes);
    return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
  } catch (_) {
    return '';
  }
}

async function otsStamp(hashHex) {
  if (!hashHex) return null;
  for (const calendar of OTS_CALENDARS) {
    try {
      const res = await fetch(calendar + '/timestamp/' + hashHex, { method: 'POST' });
      if (res.ok) return new Uint8Array(await res.arrayBuffer());
    } catch (_) { /* calendario successivo */ }
  }
  return null;
}

function bytesToB64(bytes) {
  let bin = '';
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    bin += String.fromCharCode.apply(null, bytes.subarray(i, i + CHUNK));
  }
  return btoa(bin);
}

function pdfTextValue(value) {
  if (!value) return '';
  try { if (typeof value.decodeText === 'function') return value.decodeText(); } catch (_) { /* fallback */ }
  try { if (typeof value.asString === 'function') return value.asString(); } catch (_) { /* fallback */ }
  return value.toString().replace(/^\//, '');
}

function prettySignLabel(name) {
  const raw = String(name || 'Firma').replace(/[_\-\.]+/g, ' ').trim();
  const spaced = raw.replace(/([a-zà-ù])([A-Z])/g, '$1 $2');
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

async function extractSignatureTargets(bytes) {
  await loadPdfLib();
  const lib = window.PDFLib;
  const targets = [];
  try {
    const doc = await lib.PDFDocument.load(bytes, { ignoreEncryption: true });
    const acroForm = doc.getForm().acroForm;
    const formDict = acroForm && (acroForm.dict || acroForm);
    const fields = formDict && formDict.get(lib.PDFName.of('Fields'));
    if (!fields) return targets;
    const pages = doc.getPages();
    for (const ref of fields.asArray()) {
      const dict = doc.context.lookup(ref);
      if (!dict || !dict.get(lib.PDFName.of('FT')) || dict.get(lib.PDFName.of('FT')).toString() !== '/Sig') continue;
      const fieldName = pdfTextValue(dict.get(lib.PDFName.of('T')));
      const kids = dict.get(lib.PDFName.of('Kids'));
      const widgets = kids ? kids.asArray().map((r) => doc.context.lookup(r)) : [dict];
      for (const w of widgets) {
        if (!w || !w.get(lib.PDFName.of('Rect'))) continue;
        const rect = w.get(lib.PDFName.of('Rect')).asRectangle();
        let pageIndex = pages.length - 1;
        const pageRef = w.get(lib.PDFName.of('P'));
        if (pageRef) {
          const idx = pages.findIndex((p) => p.ref === pageRef);
          if (idx >= 0) pageIndex = idx;
        }
        targets.push({ pageIndex, rect, name: fieldName || pdfTextValue(w.get(lib.PDFName.of('T'))) || 'Firma' });
      }
    }
  } catch (_) { /* nessun campo firma rilevabile */ }
  return targets;
}

/* ---------- IndexedDB ---------- */

const DB_NAME = 'pdf-compilatore';
const STORE = 'pdfs';
const ARCHIVE = 'archive';

function openDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 2);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: 'name' });
      }
      if (!db.objectStoreNames.contains(ARCHIVE)) {
        db.createObjectStore(ARCHIVE, { keyPath: 'id', autoIncrement: true });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function dbAll() {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const req = db.transaction(STORE, 'readonly').objectStore(STORE).getAll();
    req.onsuccess = () => resolve(req.result || []);
    req.onerror = () => reject(req.error);
  });
}

async function dbPut(rec) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const req = db.transaction(STORE, 'readwrite').objectStore(STORE).put(rec);
    req.onsuccess = resolve;
    req.onerror = () => reject(req.error);
  });
}

async function dbDelete(name) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const req = db.transaction(STORE, 'readwrite').objectStore(STORE).delete(name);
    req.onsuccess = resolve;
    req.onerror = () => reject(req.error);
  });
}

async function archiveAdd(run) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const req = db.transaction(ARCHIVE, 'readwrite').objectStore(ARCHIVE).add(run);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function archiveAll() {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const req = db.transaction(ARCHIVE, 'readonly').objectStore(ARCHIVE).getAll();
    req.onsuccess = () => resolve(req.result || []);
    req.onerror = () => reject(req.error);
  });
}

async function archivePut(run) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const req = db.transaction(ARCHIVE, 'readwrite').objectStore(ARCHIVE).put(run);
    req.onsuccess = resolve;
    req.onerror = () => reject(req.error);
  });
}

async function archiveDelete(id) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const req = db.transaction(ARCHIVE, 'readwrite').objectStore(ARCHIVE).delete(id);
    req.onsuccess = resolve;
    req.onerror = () => reject(req.error);
  });
}

/* ---------- settings persistence ---------- */

function loadSettings() {
  try {
    const raw = localStorage.getItem('pdf-compilatore-settings');
    if (raw) Object.assign(state.settings, JSON.parse(raw));
    state.settings.theme = Object.assign({ primary: '#4338ca', accent: '#d4af37' }, state.settings.theme || {});
    if (state.settings.signEnabled === undefined) state.settings.signEnabled = true;
    if (state.settings.otsEnabled === undefined) state.settings.otsEnabled = true;
    state.settings.services = Object.assign({ pdf: true }, state.settings.services || {});
  } catch (_) { /* ignore */ }
}

function saveSettings() {
  localStorage.setItem('pdf-compilatore-settings', JSON.stringify(state.settings));
}

function apiBase() {
  const configured = state.settings.apiBase.trim().replace(/\/+$/, '');
  if (configured) return configured;
  if (location.protocol.startsWith('http')) return location.origin + '/api';
  return '';
}

/* ---------- PDF field extraction ---------- */

function fieldInfo(field) {
  const name = field.getName();
  const ctor = field.constructor.name;
  if (ctor === 'PDFTextField') {
    return { name, kind: 'text', value: field.getText() || '' };
  }
  if (ctor === 'PDFCheckBox') {
    return { name, kind: 'checkbox', value: field.isChecked() ? 'Sì' : '' };
  }
  if (ctor === 'PDFDropdown') {
    const sel = field.getSelected();
    return { name, kind: 'choice', options: field.getOptions().filter(Boolean), value: (sel && sel[0]) || '' };
  }
  if (ctor === 'PDFRadioGroup') {
    return { name, kind: 'choice', options: field.getOptions().filter(Boolean), value: field.getSelected() || '' };
  }
  if (ctor === 'PDFOptionList') {
    const sel = field.getSelected();
    return { name, kind: 'choice', options: field.getOptions().filter(Boolean), value: (sel && sel[0]) || '' };
  }
  return null;
}

async function extractQuestions(bytes) {
  await loadPdfLib();
  const doc = await window.PDFLib.PDFDocument.load(bytes, { ignoreEncryption: true });
  const form = doc.getForm();
  const out = [];
  for (const f of form.getFields()) {
    const info = fieldInfo(f);
    if (!info) continue;
    const label = prettify(info.name);
    if (info.kind === 'text' && !info.value.trim()) {
      out.push({ field: info, label, type: 'text', prefill: profileGuess(label) });
    } else if (info.kind === 'checkbox' && !info.value) {
      out.push({ field: info, label, type: 'yesno', prefill: '' });
    } else if (info.kind === 'choice' && (!info.value || !info.options.includes(info.value))) {
      out.push({ field: info, label, type: 'choice', options: info.options, prefill: '' });
    }
  }
  return out;
}

/* ---------- tema: colori e logo ---------- */

function cssVar(name) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

function applyTheme() {
  const t = state.settings.theme;
  const root = document.documentElement;
  root.style.setProperty('--primary', t.primary);
  root.style.setProperty('--accent', t.accent);
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.content = t.primary;
}

async function applyThemeFromInputs(persist) {
  state.settings.theme.primary = $('set-primary').value;
  state.settings.theme.accent = $('set-accent').value;
  applyTheme();
  if (persist) saveSettings();
}

async function logoRecord() {
  return (await dbAll()).find((r) => r.name === '__logo__') || null;
}

async function applyLogo() {
  const rec = await logoRecord();
  const url = rec ? URL.createObjectURL(new Blob([rec.bytes], { type: 'image/png' })) : 'icons/icon-192.png';
  const brand = $('brand-logo');
  if (brand) brand.src = url;
  $('logo-preview-img').src = url;
  const favicon = document.querySelector('link[rel="icon"]');
  if (favicon) favicon.href = url;
  await updatePwaManifest();
}

async function updatePwaManifest() {
  try {
    const rec = await logoRecord();
    if (!rec) return;
    const logo = await createImageBitmap(new Blob([rec.bytes], { type: 'image/png' }));
    const manifest = await (await fetch('manifest.webmanifest')).json();
    manifest.icons = [
      { src: renderIcon(logo, 192, false), sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: renderIcon(logo, 512, false), sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: renderIcon(logo, 512, true), sizes: '512x512', type: 'image/png', purpose: 'maskable' }
    ];
    manifest.theme_color = state.settings.theme.primary;
    const url = URL.createObjectURL(new Blob([JSON.stringify(manifest)], { type: 'application/manifest+json' }));
    $('manifest-link').href = url;
  } catch (_) { /* resta attivo il manifest statico */ }
}

function renderIcon(bitmap, size, maskable) {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d');
  const grad = ctx.createLinearGradient(0, 0, size, size);
  grad.addColorStop(0, state.settings.theme.primary);
  grad.addColorStop(1, cssVar('--primary-2') || state.settings.theme.primary);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);
  const w = size * (maskable ? 0.42 : 0.58);
  ctx.drawImage(bitmap, (size - w) / 2, (size - w) / 2, w, w);
  return canvas.toDataURL('image/png');
}

async function normalizeLogo(file) {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = () => reject(new Error('formato immagine non riconosciuto'));
      image.src = url;
    });
    const size = 512;
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = size;
    const ctx = canvas.getContext('2d');
    const scale = Math.min(size / img.width, size / img.height) * 0.82;
    const w = img.width * scale;
    const h = img.height * scale;
    ctx.drawImage(img, (size - w) / 2, (size - h) / 2, w, h);
    const bin = atob(canvas.toDataURL('image/png').split(',')[1]);
    return Uint8Array.from(bin, (c) => c.charCodeAt(0));
  } finally {
    URL.revokeObjectURL(url);
  }
}

/* ---------- home ---------- */

async function renderHome() {
  const list = $('pdf-list');
  list.innerHTML = '';
  const recs = await dbAll();
  state.pdfs = recs.filter((r) => r.name !== '__logo__').map((r) => ({ name: r.name, bytes: r.bytes, size: r.size }));
  $('project-name').value = state.settings.lastProject || '';
  renderArchive();
  if (!state.pdfs.length) {
    const li = document.createElement('li');
    li.innerHTML = '<span class="empty-note">Nessun PDF salvato. Tocca “Aggiungi PDF” per iniziare.</span>';
    list.appendChild(li);
  }
  for (const pdf of state.pdfs) {
    const li = document.createElement('li');
    const info = document.createElement('div');
    info.className = 'pdf-name';
    info.textContent = pdf.name;
    const meta = document.createElement('div');
    meta.className = 'pdf-meta';
    meta.textContent = (pdf.size / 1024).toFixed(0) + ' KB';
    info.appendChild(meta);
    const del = document.createElement('button');
    del.className = 'remove';
    del.textContent = '🗑';
    del.setAttribute('aria-label', 'Rimuovi ' + pdf.name);
    del.addEventListener('click', async () => {
      await dbDelete(pdf.name);
      renderHome();
    });
    li.appendChild(info);
    li.appendChild(del);
    list.appendChild(li);
  }
}

async function addPdfFiles(files) {
  const ok = [];
  for (const file of files) {
    if (!/\.pdf$/i.test(file.name) && file.type !== 'application/pdf') continue;
    try {
      const bytes = new Uint8Array(await file.arrayBuffer());
      await extractQuestions(bytes);
      await dbPut({ name: file.name, bytes, size: bytes.length });
      ok.push(file.name);
    } catch (err) {
      alert('“' + file.name + '” non è un PDF compilabile valido:\n' + err.message);
    }
  }
  await renderHome();
  if (ok.length) status($('home-status'), 'Aggiunti ' + ok.length + ' PDF: ' + ok.join(', '), 'ok');
}

/* ---------- archivio compilati ---------- */

async function renderArchive() {
  const wrap = $('archive-list');
  if (!wrap) return;
  wrap.innerHTML = '';
  const runs = (await archiveAll()).sort((a, b) => b.date.localeCompare(a.date));
  const dl = $('project-list');
  dl.innerHTML = '';
  for (const p of [...new Set(runs.map((r) => r.project))]) {
    const o = document.createElement('option');
    o.value = p;
    dl.appendChild(o);
  }
  if (!runs.length) {
    const note = document.createElement('p');
    note.className = 'empty-note';
    note.textContent = 'Nessun documento compilato: apparirà qui dopo il primo invio.';
    wrap.appendChild(note);
    return;
  }
  const byProject = new Map();
  for (const run of runs) {
    if (!byProject.has(run.project)) byProject.set(run.project, []);
    byProject.get(run.project).push(run);
  }
  for (const [project, projectRuns] of byProject) {
    const det = document.createElement('details');
    det.className = 'arch-project';
    const sum = document.createElement('summary');
    sum.textContent = '📁 ' + project + ' (' + projectRuns.length + ')';
    det.appendChild(sum);
    for (const run of projectRuns) det.appendChild(runRow(run));
    wrap.appendChild(det);
  }
}

function runRow(run) {
  const row = document.createElement('div');
  row.className = 'arch-run';
  const info = document.createElement('div');
  const d = new Date(run.date);
  const title = document.createElement('div');
  title.textContent = d.toLocaleDateString('it-IT', { day: '2-digit', month: 'short', year: 'numeric' }) +
    ' · ' + d.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' });
  const meta = document.createElement('div');
  meta.className = 'pdf-meta';
  meta.textContent = run.files.length + ' PDF · ' + (run.sent ? '✅ inviata' : '⚠️ non inviata');
  info.appendChild(title);
  info.appendChild(meta);
  const actions = document.createElement('div');
  actions.className = 'run-actions';
  const dlBtn = document.createElement('button');
  dlBtn.textContent = '⬇️';
  dlBtn.title = 'Scarica i PDF di questo invio';
  dlBtn.addEventListener('click', () => downloadRun(run));
  const shareBtn = document.createElement('button');
  shareBtn.textContent = '📤';
  shareBtn.title = 'Condividi i PDF di questo invio';
  shareBtn.addEventListener('click', () => shareRun(run));
  const delBtn = document.createElement('button');
  delBtn.textContent = '🗑';
  delBtn.title = 'Elimina questo invio dall\'archivio';
  delBtn.addEventListener('click', async () => {
    await archiveDelete(run.id);
    renderArchive();
  });
  actions.appendChild(dlBtn);
  actions.appendChild(shareBtn);
  actions.appendChild(delBtn);
  row.appendChild(info);
  row.appendChild(actions);
  return row;
}

function downloadRun(run) {
  for (const f of run.files) {
    const blob = new Blob([f.bytes], { type: 'application/pdf' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = f.name;
    a.click();
    URL.revokeObjectURL(a.href);
  }
}

async function shareRun(run) {
  const files = run.files.map((f) => new File([f.bytes], f.name, { type: 'application/pdf' }));
  if (navigator.canShare && navigator.canShare({ files })) {
    try {
      await navigator.share({ files, title: run.project });
      return;
    } catch (err) {
      if (err && err.name === 'AbortError') return;
    }
  }
  downloadRun(run);
}

/* ---------- quiz ---------- */

function buildQuestions() {
  state.questions = [];
  state.qIndex = 0;
}

async function startQuiz() {
  if (!state.pdfs.length) {
    status($('home-status'), 'Aggiungi almeno un PDF prima di iniziare.', 'err');
    return;
  }
  state.project = $('project-name').value.trim();
  state.settings.lastProject = state.project;
  saveSettings();
  state.signatureDone = false;
  state.signTargets = [];
  for (let i = 0; i < state.pdfs.length; i++) {
    state.signTargets[i] = await extractSignatureTargets(state.pdfs[i].bytes);
  }
  buildQuestions();
  for (let i = 0; i < state.pdfs.length; i++) {
    try {
      const qs = await extractQuestions(state.pdfs[i].bytes);
      for (const q of qs) {
        state.questions.push({ pdfIndex: i, pdfName: state.pdfs[i].name, ...q, value: '' });
      }
    } catch (err) {
      status($('home-status'), 'Errore leggendo “' + state.pdfs[i].name + '”: ' + err.message, 'err');
      return;
    }
  }
  if (!state.questions.length) {
    status($('home-status'), 'I PDF non hanno campi vuoti da compilare: vado direttamente all\u2019email.', 'info');
    showEmailStep();
    return;
  }
  show('quiz');
  renderQuestion();
}

function renderQuestion() {
  const total = state.questions.length;
  const q = state.questions[state.qIndex];
  $('progress-fill').style.width = (state.qIndex / total) * 100 + '%';
  $('progress-text').textContent = (state.qIndex + 1) + ' / ' + total;
  $('q-pdf').textContent = q.pdfName;
  $('q-label').textContent = q.label;
  $('q-type').textContent = q.type === 'choice' ? '\u26ab\ufe0f Scelta'
    : q.type === 'yesno' ? '\u2705 S\u00ec o No'
    : '\u270d\ufe0f Testo';
  $('q-hint').textContent = q.type === 'choice' ? 'Scegli una delle opzioni:'
    : q.type === 'yesno' ? 'Rispondi sì o no:'
    : (q.prefill ? 'Proposto dai tuoi dati predefiniti: puoi modificarlo.' : 'Scrivi la risposta:');
  const area = $('q-input-area');
  area.innerHTML = '';
  const input = document.createElement('input');
  input.type = 'text';

  if (q.type === 'text') {
    input.value = q.value || q.prefill || '';
    input.placeholder = 'La tua risposta…';
    input.id = 'q-input';
    input.autocomplete = 'off';
    area.appendChild(input);
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') nextQuestion(); });
    setTimeout(() => input.focus(), 60);
  } else if (q.type === 'yesno') {
    const group = document.createElement('div');
    group.className = 'choice-group';
    for (const opt of ['Sì', 'No']) {
      const b = document.createElement('button');
      b.type = 'button';
      b.textContent = opt;
      if (q.value === opt) b.classList.add('selected');
      b.addEventListener('click', () => {
        group.querySelectorAll('button').forEach((x) => x.classList.remove('selected'));
        b.classList.add('selected');
        state.questions[state.qIndex].value = opt;
        state.questions[state.qIndex].skipped = false;
        setTimeout(nextQuestion, 140);
      });
      group.appendChild(b);
    }
    area.appendChild(group);
  } else {
    const group = document.createElement('div');
    group.className = 'choice-group';
    for (const opt of q.options) {
      const b = document.createElement('button');
      b.type = 'button';
      b.textContent = opt;
      if (q.value === opt) b.classList.add('selected');
      b.addEventListener('click', () => {
        group.querySelectorAll('button').forEach((x) => x.classList.remove('selected'));
        b.classList.add('selected');
        state.questions[state.qIndex].value = opt;
        state.questions[state.qIndex].skipped = false;
        setTimeout(nextQuestion, 140);
      });
      group.appendChild(b);
    }
    area.appendChild(group);
  }
  $('btn-back').disabled = state.qIndex === 0;
}

function saveCurrentAnswer() {
  const q = state.questions[state.qIndex];
  const input = $('q-input');
  if (q.type === 'text' && input) q.value = input.value.trim();
}

function nextQuestion() {
  saveCurrentAnswer();
  if (state.qIndex < state.questions.length - 1) {
    state.qIndex++;
    renderQuestion();
  } else {
    showEmailStep();
  }
}

function prevQuestion() {
  saveCurrentAnswer();
  if (state.qIndex > 0) {
    state.qIndex--;
    renderQuestion();
  }
}

function skipQuestion() {
  const q = state.questions[state.qIndex];
  q.skipped = true;
  q.value = '';
  nextQuestion();
}

/* ---------- loader di risveglio ---------- */

function showLoader(text) {
  $('loader-text').textContent = text;
  $('loader-overlay').classList.remove('hidden');
}

function setLoaderText(text) {
  $('loader-text').textContent = text;
}

function hideLoader() {
  $('loader-overlay').classList.add('hidden');
}

async function wakeServer() {
  const base = apiBase();
  if (!base) return false;
  const deadline = Date.now() + 90000;
  let i = 0;
  while (Date.now() < deadline) {
    setLoaderText(LOADER_MESSAGES[i % LOADER_MESSAGES.length]);
    try {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), 8000);
      const res = await fetch(base + '/health', { signal: ctrl.signal });
      clearTimeout(t);
      if (res.ok) {
        const data = await res.json().catch(() => ({}));
        if (data.ok) return true;
      }
    } catch (_) { /* server ancora spento */ }
    i++;
    await new Promise((r) => setTimeout(r, 3000));
  }
  return false;
}

async function sendOnce(payload) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 120000);
  try {
    const res = await fetch(apiBase() + '/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: ctrl.signal
    });
    const data = await res.json().catch(() => ({}));
    return { ok: res.ok, status: res.status, data };
  } catch (err) {
    return { ok: false, status: 0, data: {}, networkError: err.name !== 'AbortError' };
  } finally {
    clearTimeout(timer);
  }
}

/* ---------- firma ---------- */

let signPad = null;

function buildSignQueue() {
  state.signQueue = [];
  state.signQueueIndex = 0;
  state.signResults = {};
  for (let i = 0; i < state.pdfs.length; i++) {
    const seen = new Set();
    for (const t of state.signTargets[i] || []) {
      if (seen.has(t.name)) continue;
      seen.add(t.name);
      state.signQueue.push({ pdfIndex: i, pdfName: state.pdfs[i].name, name: t.name });
    }
  }
}

async function showSignScreen() {
  show('sign');
  const item = state.signQueue[state.signQueueIndex];
  const total = state.signQueue.length;
  if (!item) { state.signatureDone = true; showEmailStep(); return; }
  try {
    await loadSignaturePad();
  } catch (err) {
    status($('home-status'), err.message, 'err');
    showEmailStepDirect();
    return;
  }
  const progress = $('sign-progress');
  progress.textContent = total > 1
    ? 'Firma ' + (state.signQueueIndex + 1) + ' di ' + total + ' · Documento: ' + item.pdfName
    : 'Documento: ' + item.pdfName;
  progress.classList.remove('hidden');
  $('sign-field').textContent = prettySignLabel(item.name);
  $('sign-all-row').classList.toggle('hidden', total - state.signQueueIndex < 2);
  $('sign-all').checked = false;
  const canvas = $('sign-canvas');
  const ratio = Math.max(window.devicePixelRatio || 1, 1);
  const width = canvas.offsetWidth || canvas.parentElement.clientWidth - 40;
  const height = 220;
  canvas.width = width * ratio;
  canvas.height = height * ratio;
  canvas.style.height = height + 'px';
  canvas.getContext('2d').scale(ratio, ratio);
  if (signPad) signPad.off();
  signPad = new SignaturePad(canvas, { penColor: '#1c1c4e', minWidth: 1.1 });
  const rec = (await dbAll()).find((r) => r.name === '__signature__');
  if (rec) {
    const img = new Image();
    img.onload = () => {
      const scale = Math.min((width * 0.6) / img.width, (height * 0.7) / img.height, 1);
      canvas.getContext('2d').drawImage(img, 10, 10, img.width * scale, img.height * scale);
    };
    img.src = URL.createObjectURL(new Blob([rec.bytes], { type: 'image/png' }));
  }
}

function showEmailStepDirect() {
  state.signatureDone = true;
  showEmailStep();
}

function advanceSignQueue(bytes, applyAll) {
  const item = state.signQueue[state.signQueueIndex];
  if (item && bytes) {
    if (!state.signResults[item.pdfIndex]) state.signResults[item.pdfIndex] = {};
    state.signResults[item.pdfIndex][item.name] = bytes;
  }
  state.signQueueIndex++;
  if (applyAll) {
    while (state.signQueueIndex < state.signQueue.length) {
      const next = state.signQueue[state.signQueueIndex];
      if (!state.signResults[next.pdfIndex]) state.signResults[next.pdfIndex] = {};
      state.signResults[next.pdfIndex][next.name] = bytes;
      state.signQueueIndex++;
    }
  }
  if (state.signQueueIndex < state.signQueue.length) showSignScreen();
  else { state.signatureDone = true; showEmailStep(); }
}

function trimSignatureDataUrl(dataUrl) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const c = document.createElement('canvas');
      c.width = img.width;
      c.height = img.height;
      const ctx = c.getContext('2d');
      ctx.drawImage(img, 0, 0);
      const data = ctx.getImageData(0, 0, c.width, c.height).data;
      let minX = c.width, minY = c.height, maxX = -1, maxY = -1;
      for (let y = 0; y < c.height; y++) {
        for (let x = 0; x < c.width; x++) {
          if (data[(y * c.width + x) * 4 + 3] > 8) {
            if (x < minX) minX = x;
            if (x > maxX) maxX = x;
            if (y < minY) minY = y;
            if (y > maxY) maxY = y;
          }
        }
      }
      if (maxX < 0) return resolve(dataUrl);
      const pad = 8;
      const cw = Math.min(maxX + pad, c.width) - Math.max(minX - pad, 0);
      const ch = Math.min(maxY + pad, c.height) - Math.max(minY - pad, 0);
      const out = document.createElement('canvas');
      out.width = cw;
      out.height = ch;
      out.getContext('2d').drawImage(img, Math.max(minX - pad, 0), Math.max(minY - pad, 0), cw, ch, 0, 0, cw, ch);
      resolve(out.toDataURL('image/png'));
    };
    img.onerror = () => resolve(dataUrl);
    img.src = dataUrl;
  });
}

async function confirmSignature() {
  if (!signPad || signPad.isEmpty()) {
    alert('Disegna la firma prima di continuare, oppure salta questo campo o disattiva la firma dalle Impostazioni.');
    return;
  }
  const trimmed = await trimSignatureDataUrl(signPad.toDataURL('image/png'));
  const bin = atob(trimmed.split(',')[1]);
  state.signatureBytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
  await dbPut({ name: '__signature__', bytes: state.signatureBytes, size: state.signatureBytes.length });
  advanceSignQueue(state.signatureBytes, $('sign-all').checked);
}

function skipSignature() {
  advanceSignQueue(null, false);
}

/* ---------- email step ---------- */

function showEmailStep() {
  if (!state.signatureDone && state.settings.signEnabled !== false &&
      state.signTargets.some((t) => t && t.length)) {
    buildSignQueue();
    showSignScreen();
    return;
  }
  const s = state.settings;
  $('email-to').value = s.recipient || '';
  $('email-subject').value = s.subject || 'Moduli PDF compilati';
  const filled = state.questions.filter((q) => !q.skipped && q.value);
  const summary = filled.length
    ? 'Verranno compilati ' + filled.length + ' campi in ' + state.pdfs.length + ' PDF.'
    : 'Nessun campo da compilare: i PDF originali verranno allegati così come sono.';
  $('email-summary').textContent = summary;
  updateFallback();
  show('email');
}

function updateFallback() {
  const base = apiBase();
  $('btn-fallback').classList.toggle('hidden', !!base && typeof navigator.share !== 'undefined');
}

/* ---------- compile & send ---------- */

function stripAccents(text) {
  return String(text).normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

async function compilePdfs() {
  const answers = new Map();
  for (const q of state.questions) {
    if (q.skipped || !q.value) continue;
    if (!answers.has(q.pdfIndex)) answers.set(q.pdfIndex, []);
    answers.get(q.pdfIndex).push(q);
  }
  const out = [];
  for (const [pdfIndex, qs] of answers) {
    const pdf = state.pdfs[pdfIndex];
    const doc = await window.PDFLib.PDFDocument.load(pdf.bytes, { ignoreEncryption: true });
    const form = doc.getForm();
    for (const q of qs) {
      const field = form.getField(q.field.name);
      if (!field) continue;
      const ctor = field.constructor.name;
      try {
        if (ctor === 'PDFTextField') {
          try {
            field.setText(q.value);
          } catch (_) {
            field.setText(stripAccents(q.value));
          }
        } else if (ctor === 'PDFCheckBox') {
          if (q.value === 'Sì' || q.value === 'Si') field.check(); else field.uncheck();
        } else if (ctor === 'PDFDropdown' || ctor === 'PDFRadioGroup' || ctor === 'PDFOptionList') {
          field.select(q.value);
        }
      } catch (err) {
        console.warn('Campo saltato: ' + q.field.name, err);
      }
    }
    if (state.settings.signEnabled !== false && (state.signTargets[pdfIndex] || []).length) {
      const perPdf = state.signResults[pdfIndex] || {};
      const imgs = {};
      try {
        for (const t of state.signTargets[pdfIndex]) {
          const sigBytes = perPdf[t.name];
          if (!sigBytes) continue;
          if (!imgs[t.name]) imgs[t.name] = await doc.embedPng(sigBytes);
          const page = doc.getPages()[t.pageIndex];
          if (!page) continue;
          const pad = Math.max(Math.min(t.rect.width, t.rect.height) * 0.06, 1);
          page.drawImage(imgs[t.name], {
            x: t.rect.x + pad,
            y: t.rect.y + pad,
            width: Math.max(t.rect.width - pad * 2, 1),
            height: Math.max(t.rect.height - pad * 2, 1)
          });
        }
      } catch (err) {
        console.warn('Firma non applicata', err);
      }
    }
    const bytes = await doc.save();
    const dot = pdf.name.lastIndexOf('.');
    const name = (dot > 0 ? pdf.name.slice(0, dot) : pdf.name) + '-compilato.pdf';
    out.push({ name, bytes, hash: await sha256Hex(bytes) });
  }
  return out;
}

async function sendEmail() {
  const to = $('email-to').value.trim();
  const subject = $('email-subject').value.trim();
  const body = ($('email-body').value + '\n\n' + (state.settings.signature || '')).trim();
  const st = $('send-status');
  if (!to) {
    status(st, 'Inserisci il destinatario.', 'err');
    return;
  }
  if (!apiBase()) {
    status(st, 'Nessun server di invio configurato (vedi Impostazioni).', 'err');
    return;
  }
  $('btn-send').disabled = true;
  status(st, 'Compilo i PDF e preparo l’invio…', 'info');
  try {
    const files = await compilePdfs();
    const hashNotes = [];
    if (state.settings.otsEnabled !== false) {
      showLoader('Certificazione su blockchain (OpenTimestamps)…');
      for (const f of files) {
        if (!f.hash) continue;
        const ots = await otsStamp(f.hash);
        if (ots) {
          f.ots = ots;
          hashNotes.push(f.name + ' — SHA-256 ' + f.hash + ' — proof OpenTimestamps allegata (.ots), ancoraggio Bitcoin entro ore.');
        } else {
          hashNotes.push(f.name + ' — SHA-256 ' + f.hash + ' — proof non disponibile, hash registrato in questa email.');
        }
      }
    }
    const runId = await archiveAdd({
      project: state.project || 'Senza progetto',
      date: new Date().toISOString(),
      files: files.map((f) => ({ name: f.name, bytes: f.bytes, ots: f.ots || null })),
      sent: false
    });
    const attachments = files.map((f) => ({ filename: f.name, content: bytesToB64(f.bytes) }));
    for (const f of files) {
      if (f.ots) attachments.push({ filename: f.name + '.ots', content: bytesToB64(f.ots) });
    }
    const payload = {
      to,
      subject,
      body: hashNotes.length ? body + '\n\n🔐 Integrità documenti (SHA-256):\n' + hashNotes.join('\n') : body,
      attachments
    };
    showLoader('Invio in corso…');
    let r = await sendOnce(payload);
    if (!r.ok && (r.status === 0 || r.status === 502 || r.status === 503 || r.status === 504)) {
      const woken = await wakeServer();
      if (woken) {
        setLoaderText('Server pronto, invio in corso…');
        r = await sendOnce(payload);
      }
    }
    hideLoader();
    if (r.ok) {
      await archivePut({ id: runId, project: state.project || 'Senza progetto', date: new Date().toISOString(), files: files.map((f) => ({ name: f.name, bytes: f.bytes })), sent: true });
      status(st, '✅ Email inviata a ' + to + ' con ' + payload.attachments.length + ' PDF allegati. Salvata nell\'archivio.', 'ok');
      state.questions = [];
      state.pdfs.forEach((p) => (p.compiled = true));
      renderArchive();
    } else {
      throw new Error(r.data.error || (r.status ? 'Errore del server (' + r.status + ')' : 'Server non raggiungibile'));
    }
  } catch (err) {
    hideLoader();
    status(st, '❌ ' + err.message, 'err');
    updateFallback();
  }
  $('btn-send').disabled = false;
}

async function sharePdfs() {
  const st = $('send-status');
  try {
    status(st, 'Compilo i PDF…', 'info');
    const files = await compilePdfs();
    await archiveAdd({
      project: state.project || 'Senza progetto',
      date: new Date().toISOString(),
      files: files.map((f) => ({ name: f.name, bytes: f.bytes })),
      sent: false
    });
    renderArchive();
    const shareFiles = files.map((f) => new File([f.bytes], f.name, { type: 'application/pdf' }));
    const to = $('email-to').value.trim();
    const subject = $('email-subject').value.trim();
    const body = ($('email-body').value + '\n\n' + (state.settings.signature || '')).trim();
    if (navigator.canShare && navigator.canShare({ files: shareFiles })) {
      await navigator.share({ files: shareFiles, title: subject, text: body });
      status(st, 'PDF condivisi: completa l\u2019invio dall\u2019app email.', 'ok');
    } else {
      downloadPdfs();
      const url = 'mailto:' + encodeURIComponent(to) + '?subject=' + encodeURIComponent(subject) + '&body=' + encodeURIComponent(body);
      location.href = url;
      status(st, 'PDF scaricati: allegali manualmente all\u2019email aperta.', 'info');
    }
  } catch (err) {
    if (err && err.name === 'AbortError') return;
    status(st, '❌ ' + err.message, 'err');
  }
}

function downloadPdfs() {
  compilePdfs().then((files) => {
    for (const f of files) {
      const blob = new Blob([f.bytes], { type: 'application/pdf' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = f.name;
      a.click();
      URL.revokeObjectURL(a.href);
    }
  });
}

/* ---------- settings screen ---------- */

function renderSettings() {
  renderServiceSettings();
  $('set-api').value = state.settings.apiBase;
  $('set-recipient').value = state.settings.recipient;
  $('set-subject').value = state.settings.subject;
  $('set-signature').value = state.settings.signature;
  $('set-primary').value = state.settings.theme.primary;
  $('set-accent').value = state.settings.theme.accent;
  $('set-sign-enabled').checked = state.settings.signEnabled !== false;
  $('set-ots-enabled').checked = state.settings.otsEnabled !== false;
  applyLogo();
  const wrap = $('profile-fields');
  wrap.innerHTML = '';
  for (const p of PROFILE_KEYS) {
    const label = document.createElement('label');
    label.textContent = p.label;
    const input = document.createElement('input');
    input.type = 'text';
    input.value = state.settings.profile[p.key] || '';
    input.addEventListener('change', () => {
      state.settings.profile[p.key] = input.value.trim();
      saveSettings();
    });
    label.appendChild(input);
    wrap.appendChild(label);
  }
}

function applySettingsFromForm() {
  state.settings.apiBase = $('set-api').value.trim();
  state.settings.recipient = $('set-recipient').value.trim();
  state.settings.subject = $('set-subject').value.trim();
  state.settings.signature = $('set-signature').value;
  state.settings.signEnabled = $('set-sign-enabled').checked;
  state.settings.otsEnabled = $('set-ots-enabled').checked;
  saveSettings();
}

async function testApi() {
  applySettingsFromForm();
  const st = $('api-status');
  const base = apiBase();
  if (!base) {
    status(st, 'Nessun URL API impostato: se l\u2019app è servita dal server stesso, lo stesso dominio verrà usato.', 'info');
    return;
  }
  status(st, 'Verifico…', 'info');
  try {
    const res = await fetch(base + '/health');
    const data = await res.json();
    if (res.ok && data.ok) status(st, '✅ Server raggiungibile e pronto a inviare.', 'ok');
    else throw new Error(data.error || 'Risposta inattesa');
  } catch (err) {
    status(st, '❌ Server non raggiungibile: ' + err.message, 'err');
  }
}

/* ---------- init ---------- */

function bind() {
  $('btn-add-pdf').addEventListener('click', () => $('file-input').click());
  $('file-input').addEventListener('change', (e) => {
    addPdfFiles(Array.from(e.target.files));
    e.target.value = '';
  });
  $('btn-start').addEventListener('click', startQuiz);
  $('btn-next').addEventListener('click', nextQuestion);
  $('btn-back').addEventListener('click', prevQuestion);
  $('btn-skip').addEventListener('click', skipQuestion);
  $('btn-send').addEventListener('click', sendEmail);
  $('btn-sign-ok').addEventListener('click', confirmSignature);
  $('btn-sign-clear').addEventListener('click', () => {
    if (signPad) signPad.clear();
  });
  $('btn-sign-skip').addEventListener('click', skipSignature);
  $('btn-fallback').addEventListener('click', sharePdfs);
  $('btn-download').addEventListener('click', downloadPdfs);
  $('btn-restart').addEventListener('click', () => {
    $('send-status').classList.add('hidden');
    renderHome().then(() => show('home'));
  });
  $('btn-settings').addEventListener('click', () => {
    renderSettings();
    show('settings');
  });
  $('btn-settings-back').addEventListener('click', () => {
    applySettingsFromForm();
    updateFallback();
    renderHome().then(() => show('home'));
  });
  $('btn-test-api').addEventListener('click', testApi);
  $('btn-upload-logo').addEventListener('click', () => $('logo-input').click());
  $('logo-input').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    e.target.value = '';
    if (!file) return;
    try {
      const bytes = await normalizeLogo(file);
      await dbPut({ name: '__logo__', bytes, size: bytes.length });
      await applyLogo();
    } catch (err) {
      alert('Logo non valido: ' + err.message);
    }
  });
  $('btn-remove-logo').addEventListener('click', async () => {
    await dbDelete('__logo__');
    await applyLogo();
  });
  document.querySelectorAll('.swatch').forEach((b) => b.addEventListener('click', () => {
    $('set-primary').value = b.dataset.p;
    $('set-accent').value = b.dataset.a;
    applyThemeFromInputs(true);
  }));
  $('set-primary').addEventListener('input', () => applyThemeFromInputs(false));
  $('set-accent').addEventListener('input', () => applyThemeFromInputs(false));
  $('set-primary').addEventListener('change', () => {
    applyThemeFromInputs(true);
    updatePwaManifest();
  });
  $('set-accent').addEventListener('change', () => applyThemeFromInputs(true));
}

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
}

loadSettings();
applyTheme();
bind();
applyLogo();
renderHome().then(() => show('home'));
renderServices();
