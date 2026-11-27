# PDF Compilatore — PWA

App web installabile su Android che:
1. Carica i **PDF compilabili** (AcroForm) e li tiene in memoria (IndexedDB), anche offline.
2. Individua i **campi vuoti** e pone le domande **una alla volta**, aspettando la risposta (testo, sì/no o scelta tra opzioni).
3. Precompila le risposte note dai **dati predefiniti** (nome, email, telefono, …) modificabili.
4. Compila i PDF, prepara l'**email** (destinatario, oggetto, messaggio) e la **invia automaticamente** con i PDF allegati tramite un piccolo server SMTP.

## Struttura

```
index.html / styles.css / app.js / sw.js   → la PWA (vanilla JS + pdf-lib)
manifest.webmanifest, icons/               → installabile sulla home screen
server/                                    → backend Node.js (nodemailer) per l'invio automatico
```

## Avvio in locale

```bash
cd server
cp .env.example .env        # compila i dati SMTP
npm install
npm start                   # http://localhost:8787
```

Il server serve anche i file statici della PWA: un solo processo, nessun CORS da configurare.

## Installazione su Android

1. Pubblica l'app in HTTPS (vedi sotto).
2. Apri l'URL con Chrome su Android → menu ⋮ → **Aggiungi alla schermata Home**.
3. L'app si apre a schermo intero e funziona anche offline (service worker); solo l'invio email richiede rete.

## Configurazione SMTP

Gestita interamente dal server con variabili d'ambiente (vedi `server/.env.example`). Le credenziali non toccano mai il client.

**Register.it**: host `authsmtp.securemail.pro`, porta `465` SSL, username = indirizzo della casella (o `smtp@tuodominio.it` con gli Invii aggiuntivi). Base: 50 invii/giorno per casella, estendibile con il servizio Invii aggiuntivi.

**Gmail**: attiva la verifica in due passaggi e crea una **password per app**.

## Server gratuito (Render)

Sul free tier di Render il server si "addormenta" dopo ~15 minuti di inattività. L'app è pronta: alla apertura mostra lo stato del server (🟢 pronto / 🟡 in standby) e, al primo invio, un caricatore animato mentre il server si risveglia (fino a ~90 secondi), poi completa l'invio da sola.

## Deployment

Qualsiasi host Node (Render, Railway, Fly.io, VPS) va bene:

- avvia `server/` con `npm start` e le variabili d'ambiente SMTP;
- il server espone `GET /api/health` (diagnostica) e `POST /api/send`.

Se preferisci servire la PWA da un host statico separato (GitHub Pages, Netlify), imposta in **Impostazioni → URL API** l'indirizzo del server (es. `https://mioserver.example/api`).

## Fallback senza server

Se il server non è raggiungibile, l'app propone la **condivisione Android** (Web Share API) del PDF compilato o, in alternativa, scarica i PDF e apre l'app email con destinatario/oggetto/testo pronti.

## Limiti noti

- I PDF devono avere **campi modulo** (AcroForm): i PDF scannerizzati o pieni di testo libero non sono compilabili automaticamente.
- Firma digitale: non gestita (i campi firma restano da firmare dopo il download).
