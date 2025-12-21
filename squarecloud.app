# SquareCloud app configuration for DogBot backend
# Replace placeholder values ({{...}}) in the `env` section with real secrets in the SquareCloud dashboard.

# Metadata (SquareCloud-style key/value pairs)
DISPLAY_NAME: DogBot
DESCRIPTION: Bot do DogFort
MEMORY: 1024
VERSION: recommended
AUTORESTART: true
MAIN: index.js
SUBDOMAIN: jamdosbesties

name: dogbot-backend
build:
  type: source
  path: backend

processes:
  web:
    command: gunicorn core.wsgi:application --chdir backend --bind 0.0.0.0:$PORT --workers 3
    port: $PORT
  worker:
    command: python backend/manage.py spotify_jobs all

env:
  DEBUG: "false"
  SECRET_KEY: "{{SECRET_KEY}}"
  DATABASE_URL: "{{DATABASE_URL}}"
  CANONICAL_DOMAIN: "dogbot.squareweb.app"
  ALLOWED_HOSTS: "dogbot.squareweb.app"
  CORS_ALLOWED_ORIGINS: "https://dogbot.squareweb.app"
  SPOTIFY_CLIENT_ID: "{{SPOTIFY_CLIENT_ID}}"
  SPOTIFY_CLIENT_SECRET: "{{SPOTIFY_CLIENT_SECRET}}"
  SPOTIFY_REDIRECT_URI: "https://dogbot.squareweb.app/spotify/callback/"
  SPOTIFY_FRONTEND_REDIRECT: "https://dogbot.squareweb.app/spotify/callback/"
  POLL_SHARED_SECRET: "{{POLL_SHARED_SECRET}}"

volumes:
  - name: staticfiles
    mountPath: /app/staticfiles
  - name: media
    mountPath: /app/media

healthcheck:
  path: /healthz
  interval: 30s
  timeout: 5s

# Notes:
# - Replace placeholder values in `env` with real secrets in the SquareCloud UI or CLI.
# - SquareCloud will use `requirements.txt` in `backend/` to install dependencies and the
#   `Procfile` / `processes` above to start `web` and `worker` processes.
