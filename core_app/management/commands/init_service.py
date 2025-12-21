import base64
import logging
import os
import sys
import time

from django.conf import settings
from django.core.management.base import BaseCommand
from django.db import connections
from django.db.utils import OperationalError

import requests
from urllib.parse import urlparse
import socket
import traceback
try:
    import psycopg2
except Exception:
    psycopg2 = None

logger = logging.getLogger("init_service")


def mask(val):
    if not val:
        return "<missing>"
    s = str(val)
    if len(s) <= 8:
        return "*" * len(s)
    return s[:4] + "..." + s[-4:]


class Command(BaseCommand):
    help = "Run startup checks and log initialization status"

    def add_arguments(self, parser):
        parser.add_argument("--wait-db", action="store_true", help="wait for DB to be available")

    def handle(self, *args, **options):
        logging.basicConfig(level=logging.INFO, format="[init] %(message)s")

        logger.info("Starting service initializer")

        # Environment summary (mask sensitive values)
        logger.info(f"DJANGO DEBUG={mask(os.environ.get('DEBUG'))}")
        logger.info(f"SECRET_KEY={mask(os.environ.get('SECRET_KEY'))}")
        logger.info(f"DATABASE_URL={mask(os.environ.get('DATABASE_URL'))}")
        logger.info(f"ALLOWED_HOSTS={os.environ.get('ALLOWED_HOSTS') or settings.ALLOWED_HOSTS}")
        logger.info(f"USE_S3={mask(os.environ.get('USE_S3') or getattr(settings, 'USE_S3', False))}")

        # 1) Database connectivity
        db_ok = False
        db_conn = connections['default']

        # Prefer connecting directly via DATABASE_URL using psycopg2 when available.
        database_url = os.environ.get('DATABASE_URL')
        if database_url and psycopg2 is not None:
            parsed = urlparse(database_url)
            host = parsed.hostname
            port = parsed.port or 5432
            dbname = parsed.path[1:] if parsed.path else None
            user = parsed.username
            password = parsed.password

            if options.get('wait_db'):
                logger.info("Waiting for database (DATABASE_URL) to accept connections...")
                for i in range(60):
                    try:
                        conn = psycopg2.connect(host=host, port=port, database=dbname or 'postgres', user=user, password=password, connect_timeout=5)
                        conn.close()
                        db_ok = True
                        break
                    except Exception as exc:
                        logger.debug(f"psycopg2 connect exception (attempt {i+1}): {exc}")
                        time.sleep(1)
                if not db_ok:
                    logger.error("Database (DATABASE_URL) did not become available (timeout)")
                    # Add diagnostics: DNS resolution and raw socket attempt
                    try:
                        infos = socket.getaddrinfo(host, port)
                        logger.error(f"DNS resolution for {host}:{port} returned {len(infos)} entries")
                    except Exception as dex:
                        logger.error(f"DNS resolution failed for host {host}: {dex}")
                    try:
                        s = socket.socket()
                        s.settimeout(5)
                        s.connect((host, int(port)))
                        s.close()
                        logger.error("Raw socket connect unexpectedly succeeded")
                    except Exception as sex:
                        logger.error(f"Raw socket connect to {host}:{port} failed: {sex}")
            else:
                try:
                    conn = psycopg2.connect(host=host, port=port, database=dbname or 'postgres', user=user, password=password, connect_timeout=5)
                    conn.close()
                    db_ok = True
                except Exception as exc:
                    logger.error(f"Database connection (DATABASE_URL) failed: {exc}")
                    logger.debug(traceback.format_exc())
                    # Diagnostics: DNS resolution and socket test
                    try:
                        infos = socket.getaddrinfo(host, port)
                        logger.error(f"DNS resolution for {host}:{port} returned {len(infos)} entries")
                    except Exception as dex:
                        logger.error(f"DNS resolution failed for host {host}: {dex}")
                    try:
                        s = socket.socket()
                        s.settimeout(5)
                        s.connect((host, int(port)))
                        s.close()
                        logger.error("Raw socket connect unexpectedly succeeded")
                    except Exception as sex:
                        logger.error(f"Raw socket connect to {host}:{port} failed: {sex}")

        # Fallback: use Django connection settings
        if not db_ok:
            if options.get('wait_db'):
                logger.info("Waiting for database (Django settings) to accept connections...")
                for i in range(60):
                    try:
                        with db_conn.cursor() as cur:
                            cur.execute("SELECT 1;")
                        db_ok = True
                        break
                    except OperationalError:
                        time.sleep(1)
                if not db_ok:
                    logger.error("Database did not become available (timeout)")
            else:
                try:
                    with db_conn.cursor() as cur:
                        cur.execute("SELECT 1;")
                    db_ok = True
                except Exception as exc:
                    logger.error(f"Database connection failed: {exc}")

        logger.info(f"Database connection: {'OK' if db_ok else 'FAILED'}")

        # 2) Check for unapplied migrations
        try:
            from django.db.migrations.executor import MigrationExecutor

            executor = MigrationExecutor(db_conn)
            plan = executor.migration_plan(executor.loader.graph.leaf_nodes())
            if plan:
                logger.warning(f"Unapplied migrations detected: {len(plan)} steps")
            else:
                logger.info("Migrations: up-to-date")
        except Exception as exc:
            logger.error(f"Could not check migrations: {exc}")

        # 3) Static files readiness
        try:
            static_root = getattr(settings, 'STATIC_ROOT', None)
            use_s3 = getattr(settings, 'USE_S3', False)
            if use_s3:
                logger.info("Static files: using S3 (configure AWS_* env vars)")
            elif static_root:
                if os.path.exists(static_root) and any(os.scandir(static_root)):
                    logger.info(f"Static files: present in {static_root}")
                else:
                    logger.warning(f"Static files not found in {static_root} — run collectstatic")
            else:
                logger.info("Static files: no STATIC_ROOT configured")
        except Exception as exc:
            logger.error(f"Static files check failed: {exc}")

        # 4) Import WSGI to ensure app can load
        try:
            logger.info("Loading WSGI application to verify Django app startup...")
            from django.core.wsgi import get_wsgi_application

            get_wsgi_application()
            logger.info("WSGI application loaded successfully")
        except Exception as exc:
            logger.error(f"WSGI application failed to load: {exc}")

        # 5) Spotify API check (client credentials)
        spotify_client_id = os.environ.get('SPOTIFY_CLIENT_ID') or getattr(settings, 'SPOTIFY_CLIENT_ID', None)
        spotify_client_secret = os.environ.get('SPOTIFY_CLIENT_SECRET') or getattr(settings, 'SPOTIFY_CLIENT_SECRET', None)
        if spotify_client_id and spotify_client_secret:
            try:
                logger.info("Checking Spotify token endpoint (client credentials)")
                token_url = 'https://accounts.spotify.com/api/token'
                basic = base64.b64encode(f"{spotify_client_id}:{spotify_client_secret}".encode()).decode()
                resp = requests.post(token_url, data={'grant_type': 'client_credentials'}, headers={'Authorization': f'Basic {basic}'}, timeout=5)
                if resp.status_code == 200 and resp.json().get('access_token'):
                    logger.info("Spotify token endpoint reachable — client credentials OK")
                else:
                    logger.error(f"Spotify token request failed: {resp.status_code} {resp.text}")
            except Exception as exc:
                logger.error(f"Spotify check failed: {exc}")
        else:
            logger.warning("Spotify client credentials not configured — skipping Spotify check")

        # 6) Additional health info
        try:
            logger.info(f"Python executable: {sys.executable}")
        except Exception:
            pass

        # Final summary
        ready = db_ok
        if ready:
            logger.info("Service initialization complete — ready to accept requests")
        else:
            logger.error("Service initialization incomplete — check above errors")
            # Exit non-zero so callers (entrypoint) can abort startup when critical checks fail
            sys.exit(1)
        # normal exit
        return
