#!/usr/bin/env bash
# Run the whole stack without Docker: moto (fake AWS), mock Cognito, the API
# (SQLite instead of Postgres) and the Next.js dev server. Ctrl-C stops all.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
PY="$ROOT/.venv/bin"
[ -x "$PY/python" ] || { echo "run 'make install' first"; exit 1; }

if [ "$(uname)" = "Darwin" ]; then
  # xgboost needs an OpenMP runtime; reuse the one bundled with torch.
  export DYLD_LIBRARY_PATH="$("$PY/python" -c 'import torch, os; print(os.path.join(os.path.dirname(torch.__file__), "lib"))')"
fi
export AWS_ENDPOINT_URL="${AWS_ENDPOINT_URL:-http://localhost:4566}" AWS_ACCESS_KEY_ID=test AWS_SECRET_ACCESS_KEY=test AWS_DEFAULT_REGION=us-east-1
export DATABASE_URL="${DATABASE_URL:-sqlite:///$ROOT/capplan-dev.db}"
export SIM_TICK_SECONDS="${SIM_TICK_SECONDS:-10}"
export COGNITO_KEY_DIR="$ROOT/.keys"

pids=()
cleanup() { kill "${pids[@]}" 2>/dev/null || true; }
trap cleanup EXIT INT TERM

"$PY/moto_server" -H 127.0.0.1 -p 4566 >/tmp/capplan-moto.log 2>&1 & pids+=($!)
"$PY/uvicorn" mock_cognito.app:app --port 9229 >/tmp/capplan-cognito.log 2>&1 & pids+=($!)
sleep 2
"$PY/uvicorn" capplan_api.main:app --port 8000 & pids+=($!)
(cd src/frontend && NEXT_PUBLIC_DATA_MODE=live npm run dev -- -p 3000) & pids+=($!)
echo "Dashboard → http://localhost:3000  (operator@capplan.example / Operator#2026, admin@capplan.example / Admin#2026)"
wait
