# Eksamensverksted

Øvings-app for eksamen: last opp gamle eksamener/sensorveiledninger (PDF, bilder, DOCX),
appen leser dem (også skannede sider med OCR), viser hva som går igjen, og lar deg trene.
Alt kjører i nettleseren og lagres lokalt (IndexedDB). AI-funksjoner virker bare inne i Claude (claude.ai-artefakt).

## Slik starter du
Appen må åpnes via en liten lokal server – dobbeltklikk på `index.html` gjør at demoen og opplasting feiler.

- Mac: dobbeltklikk `start.command`
- Windows: dobbeltklikk `start.bat`
- Linux: `./start.sh`

Åpne så http://localhost:8000. Krever Python 3.

## Filer
- `index.html` – side + stil
- `app.js` – hele appen (ferdig bygget). Kildekoden ligger i `source/`
- Bygge på nytt: `cd source && npm install && npm run build:root`
- `vendor/` – PDF-leser, Word-leser og OCR (norsk) lokalt
- `demo/` – oppdiktet demomateriale
