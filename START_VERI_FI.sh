#!/usr/bin/env bash
set -e
ROOT="$(cd "$(dirname "$0")" && pwd)"
cd "$ROOT"

PYTHON_CMD=""
for cmd in python3 python py; do
  if command -v "$cmd" >/dev/null 2>&1; then
    if "$cmd" -c "import sys; sys.exit(0 if (3,10) <= sys.version_info[:2] < (3,15) else 1)" >/dev/null 2>&1; then
      PYTHON_CMD="$cmd"
      break
    fi
  fi
done

if [ -z "$PYTHON_CMD" ]; then
  echo "Python 3.10 through 3.14 is required. Please install Python and try again."
  exit 1
fi

VENV_PY=""
if [ -x ".venv/bin/python" ]; then
  VENV_PY=".venv/bin/python"
elif [ -x ".venv/Scripts/python.exe" ]; then
  VENV_PY=".venv/Scripts/python.exe"
elif [ -f ".venv/Scripts/python.exe" ]; then
  VENV_PY=".venv/Scripts/python.exe"
fi

if [ -z "$VENV_PY" ]; then
  "$PYTHON_CMD" -m venv .venv
  if [ -x ".venv/bin/python" ]; then
    VENV_PY=".venv/bin/python"
  else
    VENV_PY=".venv/Scripts/python.exe"
  fi
  "$VENV_PY" -m pip install --upgrade pip
  "$VENV_PY" -m pip install -r requirements.txt
fi

"$VENV_PY" -m uvicorn main:app --app-dir "$ROOT/backend" --host 127.0.0.1 --port 8000 &
SERVER_PID=$!
trap 'kill "$SERVER_PID" 2>/dev/null || true' EXIT INT TERM

READY=0
for _ in $(seq 1 30); do
  if curl -fsS http://127.0.0.1:8000/api/health >/dev/null 2>&1; then READY=1; break; fi
  sleep 1
done

if [ "$READY" -ne 1 ]; then
  echo "Veri-Fi did not start. Check the server output for an error."
  exit 1
fi

echo "Veri-Fi is running at http://localhost:8000"

if command -v open >/dev/null 2>&1; then
  open http://localhost:8000
elif command -v xdg-open >/dev/null 2>&1; then
  xdg-open http://localhost:8000 >/dev/null 2>&1 || true
elif command -v explorer.exe >/dev/null 2>&1; then
  explorer.exe "http://localhost:8000" || true
elif command -v start >/dev/null 2>&1; then
  start http://localhost:8000 || true
fi

wait "$SERVER_PID"

