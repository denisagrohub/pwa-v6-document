/* PDF Compilatore — PWA client */
'use strict';

const PDFLIB_URL = 'https://unpkg.com/pdf-lib@1.17.1/dist/pdf-lib.min.js';

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

const state = {
  pdfs: [],          // { name, bytes, size }
  questions: [],     // { pdfIndex, field: {name, type, options}, value, skipped }
  qIndex: 0,
  settings: {
    apiBase: '',
    recipient: '',
    subject: '',
    signature: '',
    profile: {}
  }
};

/* ---------- helpers ---------- */

const $ = (id) => document.getElementById(id);

function show(screen) {
  for (const s of document.querySelectorAll('.screen')) s.classList.add('hidden');
  $('screen-' + screen).classList.remove('hidden');
  const titles = { home: 'PDF Compilatore', quiz: 'Compilazione', email: 'Email di invio', settings: 'Impostazioni' };
  $('screen-title').textContent = titles[screen] || '';
  window.scrollTo(0, 0);
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

async function loadPdfLib() {
  if (window.PDFLib) return;
  await new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = PDFLIB_URL;
    s.onload = resolve;
    s.onerror = () => reject(new Error('Impossibile scaricare pdf-lib'));
    document.head.appendChild(s);
  });
}

/* ---------- IndexedDB ---------- */

const DB_NAME = 'pdf-compilatore';
const STORE = 'pdfs';

function openDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(STORE)) {
        req.result.createObjectStore(STORE, { keyPath: 'name' });
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

/* ---------- settings persistence ---------- */

function loadSettings() {
  try {
    const raw = localStorage.getItem('pdf-compilatore-settings');
    if (raw) Object.assign(state.settings, JSON.parse(raw));
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

/* ---------- home ---------- */

async function renderHome() {
  const list = $('pdf-list');
  list.innerHTML = '';
  const recs = await dbAll();
  state.pdfs = recs.map((r) => ({ name: r.name, bytes: r.bytes, size: r.size }));
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

/* ---------- email step ---------- */

function showEmailStep() {
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
    const bytes = await doc.save();
    const dot = pdf.name.lastIndexOf('.');
    const name = (dot > 0 ? pdf.name.slice(0, dot) : pdf.name) + '-compilato.pdf';
    out.push({ name, bytes });
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
  $('btn-send').disabled = true;
  status(st, 'Compilo i PDF e preparo l\u2019invio…', 'info');
  try {
    const files = await compilePdfs();
    const attachments = files.map((f) => ({
      filename: f.name,
      content: btoa(String.fromCharCode(...f.bytes))
    }));
    const base = apiBase();
    if (!base) throw new Error('Nessun server di invio configurato (vedi Impostazioni).');
    const res = await fetch(base + '/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ to, subject, body, attachments })
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'Errore del server (' + res.status + ')');
    status(st, '✅ Email inviata a ' + to + ' con ' + attachments.length + ' PDF allegati.', 'ok');
    $('btn-send').disabled = false;
    state.questions = [];
    state.pdfs.forEach((p) => (p.compiled = true));
  } catch (err) {
    status(st, '❌ ' + err.message, 'err');
    $('btn-send').disabled = false;
    updateFallback();
  }
}

async function sharePdfs() {
  const st = $('send-status');
  try {
    status(st, 'Compilo i PDF…', 'info');
    const files = await compilePdfs();
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
  $('set-api').value = state.settings.apiBase;
  $('set-recipient').value = state.settings.recipient;
  $('set-subject').value = state.settings.subject;
  $('set-signature').value = state.settings.signature;
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
}

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
}

loadSettings();
bind();
renderHome().then(() => show('home'));
