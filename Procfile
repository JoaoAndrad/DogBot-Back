web: gunicorn core.wsgi:application --bind 0.0.0.0:$PORT --workers 3
worker: python manage.py spotify_jobs all
