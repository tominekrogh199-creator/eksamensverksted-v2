#!/bin/sh
# Starter Eksamensverksted på http://localhost:8000 (krever Python 3)
cd "$(dirname "$0")"
echo "Åpne http://localhost:8000 i nettleseren. Trykk Ctrl+C for å stoppe."
python3 -m http.server 8000 || python -m http.server 8000
