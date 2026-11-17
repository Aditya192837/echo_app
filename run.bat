@echo off
setlocal
cd /d "%~dp0"

echo ====================================================
echo Starting Echo LV Function Demo Server...
echo ====================================================

call .venv\Scripts\activate.bat

echo Opening browser at http://127.0.0.1:8000 ...
start "" http://127.0.0.1:8000

echo Starting uvicorn server on http://127.0.0.1:8000 ...
uvicorn backend.app:app --host 127.0.0.1 --port 8000

pause
