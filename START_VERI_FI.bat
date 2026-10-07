@echo off
setlocal
cd /d "%~dp0"

echo Veri-Fi first-time setup and startup
where py >nul 2>nul
if not errorlevel 1 (
  set "PYTHON=py -3"
) else (
  where python >nul 2>nul
  if errorlevel 1 (
    echo Python 3.10 through 3.14 is required. Install it from https://www.python.org/downloads/ and try again.
    pause
    exit /b 1
  )
  set "PYTHON=python"
)

%PYTHON% -c "import sys; raise SystemExit(0 if (3,10) <= sys.version_info[:2] < (3,15) else 1)" >nul 2>nul
if errorlevel 1 (
  echo Python 3.10 through 3.14 is required for the included model dependencies.
  pause
  exit /b 1
)

if not exist ".venv\Scripts\python.exe" (
  echo Creating the local Python environment...
  %PYTHON% -m venv .venv
  if errorlevel 1 goto setup_failed
  echo Installing Veri-Fi dependencies. This needs an internet connection the first time.
  ".venv\Scripts\python.exe" -m pip install --upgrade pip
  if errorlevel 1 goto setup_failed
  ".venv\Scripts\python.exe" -m pip install -r requirements.txt
  if errorlevel 1 goto setup_failed
)

echo Starting Veri-Fi at http://localhost:8000
start "Veri-Fi server" "%~dp0.venv\Scripts\python.exe" -m uvicorn main:app --app-dir "%~dp0backend" --host 127.0.0.1 --port 8000
for /L %%I in (1,1,30) do (
  powershell -NoProfile -Command "try { $r=Invoke-WebRequest -UseBasicParsing -Uri 'http://127.0.0.1:8000/api/health' -TimeoutSec 1; if ($r.StatusCode -eq 200) { exit 0 } } catch {}; exit 1" >nul 2>&1
  if not errorlevel 1 goto server_ready
  timeout /t 1 /nobreak >nul
)
echo Veri-Fi did not start. Check the Veri-Fi server window for an error.
pause
exit /b 1

:server_ready
start "" http://localhost:8000
exit /b 0

:setup_failed
echo Setup did not complete. Check that Python 3.10 through 3.13 is installed and try again.
pause
exit /b 1
