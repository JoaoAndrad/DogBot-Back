#!/bin/sh
set -e

# Prepare DB TLS certs if provided (base64 env vars) or copy local certs for dev
DEST_DIR=/secrets/postgres
mkdir -p "$DEST_DIR"
decoded=0
if [ -n "$PG_SSLROOTCERT_B64" ] || [ -n "$PG_SSLCERT_B64" ] || [ -n "$PG_SSLKEY_B64" ]; then
  echo "[entrypoint] Decoding DB certificates from env vars..."
  if [ -n "$PG_SSLROOTCERT_B64" ]; then
    echo "$PG_SSLROOTCERT_B64" | base64 -d > "$DEST_DIR/root.crt" && chmod 600 "$DEST_DIR/root.crt"
    echo "[entrypoint] Wrote $DEST_DIR/root.crt"
  fi
  if [ -n "$PG_SSLCERT_B64" ]; then
    echo "$PG_SSLCERT_B64" | base64 -d > "$DEST_DIR/client.crt" && chmod 600 "$DEST_DIR/client.crt"
    echo "[entrypoint] Wrote $DEST_DIR/client.crt"
  fi
  if [ -n "$PG_SSLKEY_B64" ]; then
    echo "$PG_SSLKEY_B64" | base64 -d > "$DEST_DIR/client.key" && chmod 600 "$DEST_DIR/client.key"
    echo "[entrypoint] Wrote $DEST_DIR/client.key"
  fi
  decoded=1
fi

# For local testing: if certs are placed under backend/certificados, copy them
if [ "$decoded" -eq 0 ] && [ -d "./backend/certificados" ]; then
  echo "[entrypoint] Copying local certs from ./backend/certificados (dev mode)"
  cp ./backend/certificados/* "$DEST_DIR/" || true
  chmod 600 "$DEST_DIR"/* || true
  decoded=1
fi

if [ "$decoded" -eq 1 ]; then
  export PG_SSLROOTCERT="$DEST_DIR/root.crt"
  export PG_SSLCERT="$DEST_DIR/client.crt"
  export PG_SSLKEY="$DEST_DIR/client.key"
  echo "[entrypoint] Exported PG_SSLCERT/PG_SSLKEY/PG_SSLROOTCERT"
fi

# Run database migrations (no input) on container start
echo "[entrypoint] Running migrations..."
if [ -n "${DB_HOST}" ] && [ "${DB_HOST}" != "" ] || [ -n "${DATABASE_URL}" ]; then
  echo "[entrypoint] Waiting for database..."
  # try connecting via psycopg2 until success (requires psycopg2-binary installed in image)
  python - <<'PY'
import os, time, sys
try:
  import psycopg2
  from urllib.parse import urlparse
except Exception:
  sys.exit(0)

# Prefer DATABASE_URL if present
db_url = os.environ.get('DATABASE_URL')
if db_url:
  parsed = urlparse(db_url)
  host = parsed.hostname
  port = parsed.port or 5432
  db = parsed.path[1:] if parsed.path else None
  user = parsed.username
  pw = parsed.password
else:
  host = os.environ.get('DB_HOST')
  port = int(os.environ.get('DB_PORT', '5432'))
  db = os.environ.get('DB_NAME')
  user = os.environ.get('DB_USER')
  pw = os.environ.get('DB_PASSWORD')

if not host:
  sys.exit(0)
ok = False
for i in range(60):
  try:
    conn = psycopg2.connect(host=host, port=port, database=db or 'postgres', user=user or 'postgres', password=pw or '')
    conn.close()
    ok = True
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

echo "[entrypoint] Running service initializer (init_service)..."
# run our startup checks which log DB, migrations, staticfiles, spotify, WSGI etc
# if init_service fails (critical), exit with error to avoid running app in degraded state
python manage.py init_service --wait-db

echo "[entrypoint] Starting command: $@"
if [ "${DEV_AUTORELOAD:-0}" = "1" ] && command -v watchmedo >/dev/null 2>&1; then
  echo "[entrypoint] DEV_AUTORELOAD enabled — starting watchmedo auto-restart"
  # watch for Python file changes and restart the Django dev server
  watchmedo auto-restart --patterns="*.py" --recursive -- python manage.py runserver 0.0.0.0:8000
else
  exec "$@"
fi
