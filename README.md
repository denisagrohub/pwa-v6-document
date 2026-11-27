# PDF Compilatore — PWA

App web installabile su Android che:
1. Carica i **PDF compilabili** (AcroForm) e li tiene in memoria (IndexedDB), anche offline.
2. Individua i **campi vuoti** e pone le domande **una alla volta**, aspettando la risposta (testo, sì/no o scelta tra opzioni).
3. Precompila le risposte note dai **dati predefiniti** (nome, email, telefono, …) modificabili.
4. Compila i PDF, prepara l'**email** (destinatario, oggetto, messaggio) e la **invia automaticamente** con i PDF allegati tramite un piccolo server SMTP.
5. Se i PDF contengono **campi firma**, chiede la firma touchscreen (signature_pad) e la inserisce nei campi.
6. **Certificazione blockchain** gratuita con OpenTimestamps: hash SHA-256 dei PDF ancorato su Bitcoin, prova `.ots` allegata all'email e salvata nell'archivio.

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

## Firma e certificazione blockchain

**Firma**: se un PDF contiene campi firma reali (`/Sig`), dopo la domanda finale l'app mostra la schermata *Firma* dove si disegna la firma col dito (libreria open source [signature_pad](https://github.com/szimek/signature_pad)). L'immagine viene ritagliata, salvata sul dispositivo e inserita dentro i rettangoli dei campi firma. Disattivabile da **Impostazioni → Firma e certificazione**.

**Blockchain (OpenTimestamps)**: al momento dell'invio, per ogni PDF viene calcolato l'hash SHA-256 e inviato ai calendari pubblici gratuiti di [OpenTimestamps](https://opentimestamps.org), che lo ancorano su Bitcoin. L'email contiene gli hash e la prova `.ots` allegata; la prova si completa entro poche ore e si verifica gratuitamente su [opentimestamps.org/verify](https://opentimestamps.org/verify) caricando PDF + `.ots`.

⚠️ Nota onesta: OpenTimestamps certifica che il file **esisteva ed era identico** in quella data (integrità + data certa). **Non** è una firma digitale legale (PAdES/CADES): per quella serve un certificato qualificato (es. firma con CNS/firma remota Aruba, InfoCert, ecc.).

## Archivio per progetto

Ogni invio viene salvato in IndexedDB nella **cartella del progetto** scelto in home (es. "Cliente Rossi — 2025"). Dall'archivio puoi rivedere data/ora, stato di invio, scaricare o ricondividere i PDF e le prove `.ots`, oppure eliminare la sessione.

## Fallback senza server

Se il server non è raggiungibile, l'app propone la **condivisione Android** (Web Share API) del PDF compilato o, in alternativa, scarica i PDF e apre l'app email con destinatario/oggetto/testo pronti.

## Limiti noti

- I PDF devono avere **campi modulo** (AcroForm): i PDF scannerizzati o pieni di testo libero non sono compilabili automaticamente.
- La firma viene inserita solo nei **campi firma widget reali** (`/Sig`): non c'è trascinamento libero del timbro, e l'immagine della firma non è una firma crittografica PAdES.
- La prova OpenTimestamps si completa entro qualche ora: subito dopo l'invio il file `.ots` è "pending" e la verifica diventa valida dopo l'ancoraggio Bitcoin.
