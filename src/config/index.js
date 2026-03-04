const env = process.env;

/**
 * Carrega todas as aplicações Spotify configuradas a partir de variáveis de ambiente numeradas.
 * Lê SPOTIFY_CLIENT_ID_1, SPOTIFY_CLIENT_SECRET_1, SPOTIFY_CLIENT_ID_2, etc.
 * Retorna um array de { index (baseado em 0), clientId, clientSecret, redirectUri }.
 * Lança erro na inicialização se nenhuma aplicação estiver configurada.
 */
function loadSpotifyApps() {
  const apps = [];
  const redirectUri = env.SPOTIFY_REDIRECT_URI || null;
  let n = 1;
  while (env[`SPOTIFY_CLIENT_ID_${n}`]) {
    apps.push({
      index: n - 1, // 0-based
      clientId: env[`SPOTIFY_CLIENT_ID_${n}`],
      clientSecret: env[`SPOTIFY_CLIENT_SECRET_${n}`] || "",
      redirectUri,
    });
    n++;
  }
  if (apps.length === 0) {
    throw new Error(
      "No Spotify apps configured. Set SPOTIFY_CLIENT_ID_1 / SPOTIFY_CLIENT_SECRET_1 (and _2, _3...) in your .env file.",
    );
  }
  return apps;
}

let _spotifyApps = null;
function getSpotifyApps() {
  if (!_spotifyApps) _spotifyApps = loadSpotifyApps();
  return _spotifyApps;
}

module.exports = {
  NODE_ENV: env.NODE_ENV || "development",
  PORT: env.PORT || 80,
  DATABASE_URL: env.DATABASE_URL || null,
  BOT_SECRET: env.BOT_SECRET || null,
  POLL_SHARED_SECRET: env.POLL_SHARED_SECRET || env.INTERNAL_API_SECRET || null,
  get spotifyApps() {
    return getSpotifyApps();
  },
};
