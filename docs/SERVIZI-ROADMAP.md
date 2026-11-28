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

### Aperto (serve dal committente)
- [ ] Tipi di documento / checklist target (elenco concreto dei documenti da verificare)
- [ ] Conferma: partire dalla Fase 1
- [ ] Secondo servizio: da elencare
- [ ] Repo del sito v6impresa.it per eventuale integrazione/collegamento
