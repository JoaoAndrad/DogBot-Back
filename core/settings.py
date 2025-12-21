"""Minimal modular settings for AssistenteNovo.
Reads simple env vars and supports toggling S3 storage via USE_S3.
"""

import os
from pathlib import Path

try:
    from dotenv import load_dotenv
except Exception:
    load_dotenv = None

try:
    import dj_database_url
except Exception:
    dj_database_url = None

BASE_DIR = Path(__file__).resolve().parent.parent


def env(key, default=None):
    return os.environ.get(key, default)


# Load .env from project root if python-dotenv is available
if load_dotenv is not None:
    env_path = BASE_DIR / ".env"
    try:
        load_dotenv(env_path)
    except Exception:
        pass

SECRET_KEY = env("SECRET_KEY", "please-change-me")
DEBUG = env("DEBUG", "true").lower() in ("1", "true", "yes")

ALLOWED_HOSTS = env("ALLOWED_HOSTS", "localhost").split(",")

# Optional canonical domain for the deployed DogBot (e.g. dogbot.squareweb.app)
# If provided via `CANONICAL_DOMAIN`, ensure it's present in ALLOWED_HOSTS.
CANONICAL_DOMAIN = env("CANONICAL_DOMAIN") or env("DOGBOT_DOMAIN")
if CANONICAL_DOMAIN:
    if CANONICAL_DOMAIN not in ALLOWED_HOSTS:
        ALLOWED_HOSTS.append(CANONICAL_DOMAIN)

INSTALLED_APPS = [
    "django.contrib.admin",
    "django.contrib.auth",
    "django.contrib.contenttypes",
    "django.contrib.sessions",
    "django.contrib.messages",
    "django.contrib.staticfiles",
    # project apps (explicit app configs)
    "core_app.apps.CoreAppConfig",
    "users.apps.UsersConfig",
    "spotify_app.apps.SpotifyAppConfig",
    "academia_app.apps.AcademiaAppConfig",
    # REST API
    "rest_framework",
    "rest_framework.authtoken",
    "corsheaders",
]

MIDDLEWARE = [
    "corsheaders.middleware.CorsMiddleware",
    "django.middleware.security.SecurityMiddleware",
    "core_app.middleware.ServiceAuthMiddleware",
    "django.contrib.sessions.middleware.SessionMiddleware",
    "django.middleware.common.CommonMiddleware",
    "django.middleware.csrf.CsrfViewMiddleware",
    "django.contrib.auth.middleware.AuthenticationMiddleware",
    "django.contrib.messages.middleware.MessageMiddleware",
    "django.middleware.clickjacking.XFrameOptionsMiddleware",
]

ROOT_URLCONF = "core.urls"

TEMPLATES = [
    {
        "BACKEND": "django.template.backends.django.DjangoTemplates",
        "DIRS": [BASE_DIR / "templates"],
        "APP_DIRS": True,
        "OPTIONS": {
            "context_processors": [
                "django.template.context_processors.debug",
                "django.template.context_processors.request",
                "django.contrib.auth.context_processors.auth",
                "django.contrib.messages.context_processors.messages",
            ],
        },
    },
]

WSGI_APPLICATION = "core.wsgi.application"

# Database: prefer universal `DATABASE_URL` (e.g. provided by SquareCloud).
database_url = env("DATABASE_URL")
if database_url and dj_database_url is not None:
    DATABASES = {"default": dj_database_url.parse(database_url)}
else:
    # Fallback to DB_* env vars (used in local docker-compose) or sqlite
    if env("DB_NAME"):
        DATABASES = {
            "default": {
                "ENGINE": "django.db.backends.postgresql",
                "NAME": env("DB_NAME"),
                "USER": env("DB_USER", ""),
                "PASSWORD": env("DB_PASSWORD", ""),
                "HOST": env("DB_HOST", "localhost"),
                "PORT": env("DB_PORT", "5432"),
            }
        }
    else:
        DATABASES = {
            "default": {
                "ENGINE": "django.db.backends.sqlite3",
                "NAME": str(BASE_DIR / "db.sqlite3"),
            }
        }

        # If the environment provides Postgres SSL client certificates/paths (decoded
        # by the entrypoint from base64 env vars), pass them to the DB driver's
        # connection options so psycopg2 can use client certs for mTLS.
        pg_sslmode = env("PG_SSLMODE") or env("PGSSLMODE")
        pg_sslcert = env("PG_SSLCERT") or env("PGSSLCERT")
        pg_sslkey = env("PG_SSLKEY") or env("PGSSLKEY")
        pg_sslrootcert = env("PG_SSLROOTCERT") or env("PGSSLROOTCERT")
        if "default" in DATABASES:
            options = DATABASES["default"].get("OPTIONS", {})
            if pg_sslmode:
                options["sslmode"] = pg_sslmode
            if pg_sslcert:
                options["sslcert"] = pg_sslcert
            if pg_sslkey:
                options["sslkey"] = pg_sslkey
            if pg_sslrootcert:
                options["sslrootcert"] = pg_sslrootcert
            if options:
                DATABASES["default"]["OPTIONS"] = options

AUTH_PASSWORD_VALIDATORS = []

LANGUAGE_CODE = "en-us"
TIME_ZONE = "UTC"
USE_I18N = True
USE_TZ = True

STATIC_URL = "/static/"
STATIC_ROOT = BASE_DIR / "staticfiles"

MEDIA_URL = "/media/"
MEDIA_ROOT = BASE_DIR / "media"

# CORS: allow configurable origins via env var (comma-separated)
CORS_ALLOWED_ORIGINS = (
    env("CORS_ALLOWED_ORIGINS", "").split(",") if env("CORS_ALLOWED_ORIGINS") else []
)
# Ensure canonical domain is allowed for CORS (use https scheme)
if CANONICAL_DOMAIN:
    canonical_origin = f"https://{CANONICAL_DOMAIN}"
    if canonical_origin not in CORS_ALLOWED_ORIGINS:
        CORS_ALLOWED_ORIGINS.append(canonical_origin)

# REST Framework minimal config: token auth for service-to-service calls
REST_FRAMEWORK = {
    "DEFAULT_AUTHENTICATION_CLASSES": (
        "rest_framework.authentication.TokenAuthentication",
    ),
    "DEFAULT_PERMISSION_CLASSES": ("rest_framework.permissions.IsAuthenticated",),
}

# S3 toggle
USE_S3 = env("USE_S3", "false").lower() in ("1", "true", "yes")
if USE_S3:
    DEFAULT_FILE_STORAGE = "storages.backends.s3boto3.S3Boto3Storage"
    STATICFILES_STORAGE = "storages.backends.s3boto3.S3StaticStorage"
    AWS_ACCESS_KEY_ID = env("AWS_ACCESS_KEY_ID")
    AWS_SECRET_ACCESS_KEY = env("AWS_SECRET_ACCESS_KEY")
    AWS_STORAGE_BUCKET_NAME = env("AWS_STORAGE_BUCKET_NAME")
    AWS_S3_REGION_NAME = env("AWS_S3_REGION_NAME", "us-east-1")

# Minimal logging to console
LOGGING = {
    "version": 1,
    "disable_existing_loggers": False,
    "handlers": {"console": {"class": "logging.StreamHandler"}},
    "root": {"handlers": ["console"], "level": "INFO"},
}
