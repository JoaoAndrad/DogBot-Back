#!/bin/sh
set -e

# Run database migrations (no input) on container start
echo "[entrypoint] Running migrations..."
if [ -n "${DB_HOST}" ] && [ "${DB_HOST}" != "" ]; then
  echo "[entrypoint] Waiting for database at ${DB_HOST}:${DB_PORT:-5432}..."
  # try connecting via psycopg2 until success (requires psycopg2-binary installed in image)
  python - <<'PY'
import os, time, sys
try:
  import psycopg2
except Exception:
  sys.exit(0)
host=os.environ.get('DB_HOST')
port=os.environ.get('DB_PORT','5432')
db=os.environ.get('DB_NAME')
user=os.environ.get('DB_USER')
pw=os.environ.get('DB_PASSWORD')
if not host:
  sys.exit(0)
ok=False
for i in range(60):
  try:
    conn=psycopg2.connect(host=host,port=port,database=db or 'postgres',user=user or 'postgres',password=pw or '')
    conn.close()
    ok=True
    break
  except Exception:
    time.sleep(1)
if not ok:
  print('Could not connect to DB after timeout', file=sys.stderr)
  sys.exit(1)
sys.exit(0)
PY

echo "[entrypoint] Database is available, running migrations..."
python manage.py migrate --noinput
else
  python manage.py migrate --noinput
fi

# Optionally run collectstatic in dev unless disabled
if [ "${DISABLE_COLLECTSTATIC:-0}" != "1" ]; then
  echo "[entrypoint] Running collectstatic..."
  python manage.py collectstatic --noinput || true
fi

echo "[entrypoint] Starting command: $@"
if [ "${DEV_AUTORELOAD:-0}" = "1" ] && command -v watchmedo >/dev/null 2>&1; then
  echo "[entrypoint] DEV_AUTORELOAD enabled — starting watchmedo auto-restart"
  # watch for Python file changes and restart the Django dev server
  watchmedo auto-restart --patterns="*.py" --recursive -- python manage.py runserver 0.0.0.0:8000
else
  exec "$@"
fi
