# Roadmap Servizi — PDF Compilatore / Hub V6

Registro dei servizi previsti per la PWA (hub stile iOS in home, attivazione da Impostazioni → Servizi attivi).

Stato: ⬜ in arrivo · 🚧 in costruzione · ✅ attivo

| Servizio | Stato | Note |
|---|---|---|
| PDF Compilatore | ✅ attivo | Compilazione AcroForm, firma, OpenTimestamps, invio SMTP |
| Valutazione Cassetto Fiscale | ⬜ in arrivo | Specifica sotto, in attesa di checklist e priorità |
| Business Plan / Project Finance | ⬜ da definire | Presente su v6impresa.it; possibile collegamento futuro |
| Analisi aziendale | ⬜ da definire | Presente su v6impresa.it |

Sito di riferimento: https://www.v6impresa.it (business-plan, analisi-aziendale, ricambio-generazionale, acquisto-tee, esg, team-building, formazione-aziendale, kaizen-lean, project-finance, partnership).

---

## Servizio: Valutazione Cassetto Fiscale

### Obiettivo
Caricare una serie di documenti fiscali/aziendali, farli leggere e catalogare dal sistema, e ottenere un **report** che dica:
- quali documenti della checklist **ci sono**
- quali **mancano**
- se i presenti sono **regolari** (scadenze, firme, campi obbligatori, coerenze)

Due modalità (come da richiesta):
1. **Prima valutazione**: batch di documenti → analisi veloce → report sintetico
2. **Documenti completi**: archivi anche di gigabyte → elaborazione a coda con checklist completa

### Ricerca effettuata (2026-11)
- **Nessun equivalente open source pronto** per questo caso d'uso
- Commerciali di riferimento (categoria Deloitte Smart Document Agent; data room AI tipo Datasite/Ansarada/Harvey/Kira; italiane Febot, Cassetto Fiscale Click, Lexdebita) — SaaS a pagamento, non personalizzabili
- Mattoni open source validi da riusare:
  - FatturaPA `.xml`/`.p7m`: `fatturapa-client` (TypeScript, parsing + buste firmate), `fatturaHub` (self-hosted, riferimento architetturale)
  - Estrazione testo PDF: `pdf.js` / `pdf-parse` (browser e Node)
  - OCR gratuito: `tesseract.js` (anche lato browser)
  - hashes/notarizzazioni: già presenti nell'app (OpenTimestamps) — riutilizzabili per certificare il report

### Architettura proposta
**Fase 1 — Prima valutazione** (client-side dove possibile):
1. Upload batch (PDF, XML, immagini)
2. Lettura: testo PDF diretto · XML FatturaPA nativo · OCR fallback (tesseract.js nel browser, così i documenti non lasciano il telefono quando hanno testo)
3. Catalogazione per tipo con regole+parole chiave configurabili (fatture, contratti, bilanci, F24, visure, pagamenti, dipendenti, …)
4. Confronto con checklist (template per tipo pratica, es. due diligence: dichiarazioni 5 anni, bilanci approvati, DURC, certificazioni, …)
5. Report: ✅ presenti · ❌ mancanti · ⚠️ da verificare + giudizio sintetico di regolarità
6. Report inviabile via email (riusa `/api/send`) + salvato in archivio + hash OpenTimestamps

**Fase 2 — Documenti completi (GB)**:
- Upload a blocchi con progresso, coda di elaborazione un file alla volta, catalogo per progetto
- ⚠️ Vincolo: il free tier di Render (512 MB RAM, disco effimero) non regge gigabyte persistenti → serve piano superiore o storage esterno (S3/B2) prima di abilitare la Fase 2 in produzione

### Integrazione con la piattaforma V6 Impresa (repo `denisagrohub/v6-impresa-ai-new`)

Il repo del sito (analizzato 2026-11) è una piattaforma completa: frontend **Next.js multi-brand** (Turborepo, deploy Vercel al push — mai push diretti su main) + backend **Odoo** con ~50 moduli `erpv6_*` e gateway REST `/api/v1/*` (`erpv6_api_gateway`).

Sinergie dirette con questa PWA:
- **erpv6_blockchain**: già usa **OpenTimestamps su Bitcoin** con gli stessi calendari della nostra PWA → certificazione coerente tra app e piattaforma; pagina pubblica di verifica `/api/v1/public/verify/<token>` già esistente
- **Checklist**: `admin_deal_checklists_api` + `consultant_deal_checklists_api` — motore checklist già presente → la checklist del cassetto fiscale può appoggiarvisi
- **Documenti**: `erpv6_relation_documents` + `admin_documents_api` — gestione/Archiviazione documenti lato piattaforma
- **Firma**: `erpv6_sign` + `/api/v1/sign/request` e `/status` — richieste firma remota già implementate lato piattaforma (la nostra firma touchscreen resta per i campi AcroForm)
- **Autenticazione**: magic link → JWT già usata dalle pagine `/c/<token>` — la PWA può autenticarsi con lo stesso flusso
- **Fiscalità**: `erpv6_accounting`, `erpv6_crediti` — dati contabili potenzialmente incrociabili nell'analisi

Opzioni di collegamento della PWA:
1. **Standalone** (attuale): server Render proprio, report via email
2. **Collegata**: la PWA chiama il gateway Odoo `/api/v1/*` con JWT magic-link → documenti e report finiscono nei progetti della piattaforma (serve conferma CORS e regole di accesso)
3. **Ibrida**: Fase 1 del cassetto fiscale lato PWA (privacy: analisi nel browser), risultati e report caricati in piattaforma via API

### Aperto (serve dal committente)
- [ ] Tipi di documento / checklist target (elenco concreto dei documenti da verificare)
- [ ] Conferma: partire dalla Fase 1
- [ ] Secondo servizio: da elencare
- [ ] Repo del sito v6impresa.it per eventuale integrazione/collegamento
