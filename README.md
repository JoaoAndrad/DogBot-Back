# DogBot Backend (minimal)

Minimal backend scaffold for DogBot: Express + Prisma.

Quick start (dev with docker Postgres):

1. Start Postgres:

```bash
docker-compose up -d
```

2. Install dependencies:

```bash
cd backend
npm install
npx prisma generate
```

3. Create schema migrations (first run locally):

```bash
npx prisma migrate dev --name init
```

4. Run the app:

```bash
npm run dev
```

5. Check DB connection:

Open `http://localhost:8000/connected` — response will be `{ message: 'Conectado com sucesso' }` if DB connection succeeds.

Notes:

- Update `DATABASE_URL` in your environment or use `.env` based on `.env.example`.
- In production run `npx prisma migrate deploy` instead of `migrate dev`.
