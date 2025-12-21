DISPLAY_NAME=DogBot-Back
DESCRIPTION=Back do DogFort
MEMORY=1024
VERSION=recommended
AUTORESTART=true
MAIN=app.py
SUBDOMAIN=dogbot

# Build configuration: ensure SquareCloud installs dependencies from `backend/`
build:
	type: source
	path: backend

processes:
	web:
		command: gunicorn core.wsgi:application --chdir backend --bind 0.0.0.0:$PORT --workers 3
	worker:
		command: python backend/manage.py spotify_jobs all

env:
	# Quote the scopes to avoid shell word-splitting errors
	SPOTIFY_SCOPES: "user-read-currently-playing user-read-playback-state user-modify-playback-state playlist-modify-public playlist-modify-private"

