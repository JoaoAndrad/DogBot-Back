// Resilient admin module: try AdminJS at runtime, otherwise fallback to a
// simple basic-auth admin UI that uses Prisma directly (no extra deps).
const express = require('express');
const fs = require('fs');
const path = require('path');
const db = require('./db');

const ADMIN_USER = process.env.ADMIN_USER || 'admin';
const ADMIN_PASS = process.env.ADMIN_PASS || 'changeme';

function basicAuthMiddleware(req, res, next) {
  const auth = req.headers.authorization;
  if (!auth || !auth.startsWith('Basic ')) {
    res.set('WWW-Authenticate', 'Basic realm="Admin"');
    return res.status(401).send('Authentication required');
  }
  const creds = Buffer.from(auth.split(' ')[1] || '', 'base64').toString();
  const [user, pass] = creds.split(':');
  if (user === ADMIN_USER && pass === ADMIN_PASS) return next();
  res.set('WWW-Authenticate', 'Basic realm="Admin"');
  return res.status(401).send('Invalid credentials');
}

function buildSimpleAdminRouter() {
  const router = express.Router();
  router.use(basicAuthMiddleware);

  router.get('/', (req, res) => {
    res.send(`
      <html>
        <head><title>DogBot Admin</title></head>
        <body>
          <h1>DogBot Admin</h1>
          <ul>
            <li><a href="/admin/db-status">DB Status</a></li>
            <li><a href="/admin/test_introspect">Test Introspect (rows)</a></li>
            <li><a href="/admin/polls">Polls (rows)</a></li>
            <li><a href="/admin/db-debug">DB Debug (cert file status)</a></li>
            <li>
              <form method="POST" action="/admin/grant-permissions" style="display: inline;" onsubmit="return confirm('Executar GRANTs para squarecloud? Isso modificará permissões no banco de dados.')">
                <button type="submit" style="background: none; border: none; color: blue; text-decoration: underline; cursor: pointer; padding: 0;">Grant Permissions</button>
              </form>
            </li>
          </ul>
        </body>
      </html>
    `);
  });

  router.get('/db-status', async (req, res) => {
    try {
      await db.testConnection();
      res.json({ status: 'connected' });
    } catch (err) {
      res.status(500).json({ status: 'error', message: err.message });
    }
  });

  // Diagnostic endpoint: shows presence and sizes of cert files and DB URL flags.
  // Protected by the same basic auth used for the admin UI.
  router.get('/db-debug', (req, res) => {
    try {
      const certDir = path.join(__dirname, '..', 'prisma', 'certs');
      const p12 = path.join(certDir, 'client-identity.p12');
      const certPem = path.join(certDir, 'client-cert.pem');
      const keyPem = path.join(certDir, 'client-key.pem');
      const caPem = path.join(certDir, 'ca-certificate.crt');

      const statSafe = p => {
        try {
          if (fs.existsSync(p)) {
            const s = fs.statSync(p);
            return { exists: true, bytes: s.size };
          }
        } catch (e) {
          // ignore
        }
        return { exists: false, bytes: 0 };
      };

      const p12Stat = statSafe(p12);
      const certStat = statSafe(certPem);
      const keyStat = statSafe(keyPem);
      const caStat = statSafe(caPem);

      // Masked DATABASE_URL flags: show whether sslidentity/sslcert present, but don't return the URL itself
      const dbUrl = process.env.DATABASE_URL || '';
      const hasSslIdentity = /sslidentity=/i.test(dbUrl);
      const hasSslCert = /sslcert=/i.test(dbUrl);
      const hasSslKey = /sslkey=/i.test(dbUrl);
      const hasSslRoot = /sslrootcert=/i.test(dbUrl);

      res.json({
        prisma_cert_dir: certDir,
        prisma_p12: p12Stat,
        prisma_cert_pem: certStat,
        prisma_key_pem: keyStat,
        prisma_ca_pem: caStat,
        env_flags: {
          has_PRISMA_P12_BASE64: !!process.env.PRISMA_P12_BASE64,
          has_P12_PASSWORD: !!process.env.P12_PASSWORD,
          PGSSLCERT_set: !!process.env.PGSSLCERT,
          PGSSLKEY_set: !!process.env.PGSSLKEY,
          PGSSLROOTCERT_set: !!process.env.PGSSLROOTCERT,
        },
        database_url_flags: {
          hasSslIdentity,
          hasSslCert,
          hasSslKey,
          hasSslRoot,
        },
      });
    } catch (e) {
      res.status(500).json({ ok: false, error: e && e.message ? e.message : String(e) });
    }
  });

  // Return last Prisma error recorded in the running process (masked)
  router.get('/last-prisma-error', (req, res) => {
    try {
      const lastEntry = db.getLastPrismaError && db.getLastPrismaError();
      if (!lastEntry || (!lastEntry.error && !lastEntry.diag))
        return res.json({ ok: true, last: null });
      const err = lastEntry.error || null;
      const diag = lastEntry.diag || null;
      const out = {
        message: err ? err.message || String(err) : null,
        stack: err ? err.stack || null : null,
        diag,
      };
      res.json({ ok: err ? false : true, last: out });
    } catch (e) {
      res.status(500).json({ ok: false, error: e && e.message ? e.message : String(e) });
    }
  });

  router.get('/test_introspect', async (req, res) => {
    try {
      const prisma = db.getPrisma();
      const rows = await prisma.testIntrospect.findMany();
      res.json(rows);
    } catch (err) {
      res.status(500).json({ error: 'Failed to query test_introspect', details: err.message });
    }
  });

  router.post('/test_introspect', express.json(), async (req, res) => {
    try {
      const { name } = req.body || {};
      const prisma = db.getPrisma();
      const created = await prisma.testIntrospect.create({ data: { name } });
      res.status(201).json(created);
    } catch (err) {
      res.status(500).json({ error: 'Failed to create', details: err.message });
    }
  });

  router.post('/grant-permissions', async (req, res) => {
    try {
      const prisma = db.getPrisma();
      // Executar GRANTs necessários para o usuário squarecloud
      await prisma.$executeRaw`GRANT USAGE ON SCHEMA public TO squarecloud`;
      await prisma.$executeRaw`GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO squarecloud`;
      await prisma.$executeRaw`GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO squarecloud`;
      // Para futuras tabelas
      await prisma.$executeRaw`ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO squarecloud`;
      await prisma.$executeRaw`ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO squarecloud`;

      res.json({ success: true, message: 'Permissões concedidas ao usuário squarecloud' });
    } catch (err) {
      res.status(500).json({ error: 'Falha ao conceder permissões', details: err.message });
    }
  });

  router.get('/polls', async (req, res) => {
    try {
      const prisma = db.getPrisma();
      const rows = await prisma.poll.findMany();
      res.json(rows);
    } catch (err) {
      res.status(500).json({ error: 'Failed to query polls', details: err.message });
    }
  });

  // Allow an authenticated admin to recreate the Prisma client and re-run connectivity checks
  router.post('/reconnect', async (req, res) => {
    try {
      await db.recreatePrismaClient();
      await db.testConnection();
      res.json({ ok: true, message: 'Recreated Prisma client and verified connection' });
    } catch (err) {
      res.status(500).json({ ok: false, error: err && err.message ? err.message : String(err) });
    }
  });

  return router;
}

function buildAdminRouter() {
  try {
    // Load AdminJS lazily; if modules are installed this will succeed.
    const AdminJS = require('@adminjs/core');
    const AdminJSExpress = require('@adminjs/express');

    const adminJs = new AdminJS({ rootPath: '/admin', branding: { companyName: 'DogBot Admin' } });
    const cookiePassword = process.env.SESSION_SECRET || 'session-secret-change-me';

    const router = AdminJSExpress.buildAuthenticatedRouter(
      adminJs,
      {
        authenticate: async (email, password) => {
          if (email === ADMIN_USER && password === ADMIN_PASS) return { email };
          return null;
        },
        cookieName: 'adminjs',
        cookiePassword,
      },
      null,
      {
        resave: false,
        saveUninitialized: true,
        secret: cookiePassword,
        cookie: { httpOnly: true },
      }
    );

    router.get('/db-status', async (req, res) => {
      try {
        await db.testConnection();
        res.json({ status: 'connected' });
      } catch (err) {
        res.status(500).json({ status: 'error', message: err.message });
      }
    });

    router.get('/last-prisma-error', (req, res) => {
      try {
        const lastEntry = db.getLastPrismaError && db.getLastPrismaError();
        if (!lastEntry || (!lastEntry.error && !lastEntry.diag))
          return res.json({ ok: true, last: null });
        const err = lastEntry.error || null;
        const diag = lastEntry.diag || null;
        const out = {
          message: err ? err.message || String(err) : null,
          stack: err ? err.stack || null : null,
          diag,
        };
        res.json({ ok: err ? false : true, last: out });
      } catch (e) {
        res.status(500).json({ ok: false, error: e && e.message ? e.message : String(e) });
      }
    });

    return router;
  } catch (e) {
    return buildSimpleAdminRouter();
  }
}

module.exports = { buildAdminRouter };
