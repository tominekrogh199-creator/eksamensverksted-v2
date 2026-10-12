@echo off
cd /d "%~dp0"
echo Apne http://localhost:8000 i nettleseren. Lukk vinduet for a stoppe.
py -m http.server 8000 || python -m http.server 8000
