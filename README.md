# AssistenteNovo — Django base

Minimal Django starter that mirrors a scalable base with a toggleable S3 storage.

Quick start (requires Docker):

```bash
# from repository root
cd AssistenteNovo
docker compose up -d --build
docker compose exec web python manage.py migrate
# open http://localhost:8000
```

To run without Docker:

```bash
python -m venv .venv
.venv\Scripts\activate      # Windows
pip install -r requirements.txt
python manage.py migrate
python manage.py runserver
```

Enable S3 by setting `USE_S3=true` and providing `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY` and `AWS_STORAGE_BUCKET_NAME`.

## Environment

Copy the example environment file and update values before running locally:

```bash
# from repository root
cp .env.example .env    # on Windows PowerShell: Copy-Item .env.example .env
```

The project uses `python-dotenv` (already listed in `requirements.txt`) to load `.env` when present.

## Create a superuser

Using Docker (recommended):

```bash
# build and start containers
docker compose up -d --build

# run migrations (entrypoint runs migrate automatically, but you can run explicitly)
docker compose exec web python manage.py migrate

# create a superuser interactively
docker compose exec web python manage.py createsuperuser
```

Without Docker (local venv):

```bash
# after activating venv and installing requirements
python manage.py migrate
python manage.py createsuperuser
```

## Access URLs

- Admin: http://localhost:8000/admin/
- Health check: http://localhost:8000/health/
