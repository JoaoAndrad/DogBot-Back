# Spotify Listening History & Wrapped

Sistema completo de rastreamento de escuta do Spotify com suporte para geração de Wrapped personalizado.

## Arquitetura

### Schema (Prisma)

**Models principais:**

- `Track` - Metadados das músicas (name, artists, album, audioFeatures, genres)
- `TrackPlayback` - Registros individuais de reprodução (com throttling/deduplicação)
- `ListeningSession` - Agrupa playbacks em sessões temporais
- `UserListeningSummary` - Agregações diárias/mensais (JSON)
- `UserYearSummary` - Wrapped anual pré-computado
- `TrackStat` - Estatísticas globais por track

### Estrutura de código

```
src/
  domains/spotify/
    controllers/
      spotifyHistoryController.js  # Endpoints HTTP
    repo/
      trackRepo.js                  # CRUD Track + stats
      playbackRepo.js               # CRUD TrackPlayback
      sessionRepo.js                # Listening sessions
      summaryRepo.js                # Daily/monthly aggregations
    services/
      playbackTrackerService.js     # Core tracking logic (throttling, enrichment)
  services/
    spotifyMonitor.js               # Polling loop (já existente)
    spotifyService.js               # Token mgmt + integration
  routes/
    spotifyHistory.js               # Mount /api/spotify routes
```

## Fluxo de Dados

1. **Monitor** (`spotifyMonitor.js`)

   - A cada 10s, consulta Spotify API via `userSpotifyAdapter.getCurrentlyPlaying()`
   - Chama `spotifyService.fetchAndPersistUser()`

2. **Persistence** (`playbackTrackerService.js`)

   - **In-memory caching**: mantém sessão ativa por usuário
   - **Throttling**: só grava a cada 30s ou 30% da música
   - **Deduplicação**: mesma track = acumula tempo, track nova = flush anterior
   - **Enrichment**: busca audioFeatures/genres em background

3. **Storage**
   - `Track` upsert (1x por track)
   - `TrackPlayback` create/update (throttled)
   - `TrackStat` increment (agregado)
   - `UserListeningSummary` update JSON field (daily/monthly)
   - `ListeningSession` track sessions

## API Endpoints

Base: `/api/spotify` (requer authHeader)

### GET /api/spotify/history

Histórico de plays paginado.

**Query params:**

- `userId` (required)
- `from` (ISO date)
- `to` (ISO date)
- `page` (default: 1)
- `limit` (default: 50)

**Response:**

```json
{
  "data": [
    {
      "id": "uuid",
      "track": { "id": "spotifyId", "name": "...", "artists": [...] },
      "startedAt": "2026-01-01T10:30:00Z",
      "listenedMs": 180000,
      "percentPlayed": 85.5
    }
  ],
  "page": 1,
  "limit": 50,
  "total": 250,
  "totalPages": 5
}
```

### GET /api/spotify/summary

Resumo mensal ou geral.

**Query params:**

- `userId` (required)
- `month` (YYYY-MM, optional)

**Response (monthly):**

```json
{
  "month": "2026-01",
  "totalMs": 1800000,
  "playCount": 150,
  "topTrackId": "spotifyId",
  "days": [
    { "date": "2026-01-15", "totalMs": 60000, "playCount": 5 }
  ],
  "topTracks": [
    { "name": "Track", "artists": [...], "totalMinutes": 30, "playCount": 10 }
  ]
}
```

### GET /api/spotify/stats

Estatísticas gerais do usuário.

**Query params:**

- `userId` (required)

**Response:**

```json
{
  "totalMinutes": 12000,
  "topTracks": [
    { "id": "...", "name": "...", "artists": [...], "totalMinutes": 500, "playCount": 25 }
  ],
  "recentPlays": [
    { "track": {...}, "playedAt": "...", "listenedMinutes": 3 }
  ]
}
```

### GET /api/spotify/current

Música sendo tocada agora (ou última).

**Query params:**

- `userId` (required)

**Response:**

```json
{
  "playing": true,
  "track": { "id": "...", "name": "...", "artists": [...], "imageUrl": "..." },
  "startedAt": "2026-01-01T14:20:00Z",
  "listenedMs": 45000,
  "percentPlayed": 25.5
}
```

## Campos para Wrapped

**Track.audioFeatures (JSON):**

```json
{
  "danceability": 0.75,
  "energy": 0.82,
  "valence": 0.68,
  "tempo": 128.5,
  "loudness": -5.2,
  "speechiness": 0.04,
  "acousticness": 0.12,
  "instrumentalness": 0.0,
  "liveness": 0.08
}
```

**Track.genres:**

```json
["pop", "indie rock", "alternative"]
```

**TrackPlayback flags:**

- `isFirstPlay` - primeira vez que ouviu
- `wasSkipped` - pulou (< 30% ouvido)
- `wasRepeated` - tocou novamente
- `deviceType` - smartphone, computer, speaker
- `contextType` - playlist, album, artist, search

**UserYearSummary (pré-computado):**

```json
{
  "year": 2026,
  "totalMinutes": 50000,
  "totalPlays": 5000,
  "uniqueTracks": 800,
  "uniqueArtists": 250,
  "topTracks": [{ "trackId": "...", "plays": 100, "minutes": 450 }],
  "topArtists": [{ "name": "...", "plays": 200, "minutes": 900 }],
  "topGenres": [{ "genre": "pop", "percentage": 35 }],
  "hourlyPattern": { "00": 10, "01": 5, ..., "23": 50 },
  "weekdayPattern": { "Monday": 800, ... },
  "monthlyPattern": { "01": 4500, "02": 4200, ... },
  "avgDanceability": 0.72,
  "avgEnergy": 0.68,
  "avgValence": 0.65,
  "newTracksCount": 300,
  "skipRate": 0.15,
  "longestStreak": { "days": 45, "from": "2026-01-15", "to": "2026-03-01" }
}
```

## Próximos Passos

### Implementação pendente:

1. **Migration**

   ```bash
   npx prisma migrate dev --name add_spotify_wrapped_fields
   npx prisma generate
   ```

2. **Enrichment service**

   - Implementar `fetchAudioFeatures()` em `playbackTrackerService`
   - Implementar `fetchGenres()` via Spotify Artists API
   - Adicionar batch job para enriquecer tracks antigos

3. **Wrapped computation service**

   - Implementar `wrappedComputeService.js`
   - Job noturno para computar `UserYearSummary`
   - Endpoint `GET /api/spotify/wrapped/:year`

4. **Legacy import**

   - Script `scripts/import_legacy_spotify.js`
   - Ler Firebase exports do sistema antigo
   - Mapear para Track + TrackPlayback

5. **Cleanup job**
   - Deletar playbacks > 90 dias (manter summaries)
   - Arquivar dados antigos

## Comandos

### Development

```bash
cd backend
npm install
npx prisma generate
npm run dev
```

### Create migration

```bash
npx prisma migrate dev --name add_spotify_wrapped_fields
```

### Deploy migration

```bash
npm run prisma:migrate
```

### Test endpoints

```bash
# History
curl -H "X-Secret: YOUR_SECRET" "http://localhost/api/spotify/history?userId=UUID&from=2026-01-01&to=2026-01-31"

# Summary
curl -H "X-Secret: YOUR_SECRET" "http://localhost/api/spotify/summary?userId=UUID&month=2026-01"

# Stats
curl -H "X-Secret: YOUR_SECRET" "http://localhost/api/spotify/stats?userId=UUID"

# Current
curl -H "X-Secret: YOUR_SECRET" "http://localhost/api/spotify/current?userId=UUID"
```

## Performance

### Throttling

- Monitor: 10s interval
- Flush: a cada 30s ou 30% da música
- Reduz writes em ~90%

### Caching

- In-memory: sessões ativas
- Track metadata: 1h TTL
- Audio features: persistent (fetch 1x)

### Indexes (já definidos no schema)

- `TrackPlayback(userId)`
- `TrackPlayback(trackId, startedAt)`
- `TrackPlayback(sessionId)`
- `UserYearSummary(userId, year)` UNIQUE
- `ListeningSession(userId, startedAt)`

### Retenção

- Raw playbacks: 90 dias
- Summaries: indefinido
- Stats: indefinido
