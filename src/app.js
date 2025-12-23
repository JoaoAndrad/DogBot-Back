const express = require('express');
const { testConnection } = require('./db');
const { buildAdminRouter } = require('./admin');

const app = express();
app.use(express.json());

app.get('/connected', async (req, res) => {
  try {
    await testConnection();
    return res.json({ message: 'Conectado com sucesso' });
  } catch (err) {
    console.error('DB connection failed:', err.message || err);
    return res.status(500).json({ error: 'Falha ao conectar ao banco', details: err.message });
  }
});

app.get('/health', (req, res) => res.json({ status: 'ok' }));

// Mount admin UI at /admin
try {
  const adminRouter = buildAdminRouter();
  app.use('/admin', adminRouter);
} catch (err) {
  console.warn('AdminJS failed to mount:', err && err.message ? err.message : err);
}

module.exports = app;
