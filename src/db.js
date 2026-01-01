const fs = require("fs");
const path = require("path");
const { PrismaClient } = require("@prisma/client");

// Configuração centralizada de certificados
try {
  const { setupCerts } = require("./certs");
  setupCerts();
} catch (e) {
  console.warn(
    "Falha ao carregar configuração de certificados:",
    e && e.message ? e.message : e
  );
}

// -- Diagnostics helpers and summary logging (safe-mask secrets)
function maskValue(v, keep = 4) {
  if (!v) return "";
  const s = String(v);
  if (s.length <= keep * 2) return "****";
  return s.slice(0, keep) + "..." + s.slice(-keep);
}

function maskDatabaseUrl(url) {
  if (!url) return "";
  try {
    // basic mask: hide user password in postgresql://user:pass@host/...
    return url.replace(
      /(postgresql:\/\/)([^:\/]+):([^@]+)@/,
      (m, p1, user, pass) => {
        return `${p1}${user}:${maskValue(pass)}@`;
      }
    );
  } catch (e) {
    return "****";
  }
}

function statIfExists(filePath) {
  try {
    const stat = fs.statSync(filePath);
    return { exists: true, size: stat.size, mtime: stat.mtime.toISOString() };
  } catch (e) {
    return { exists: false };
  }
}

// Cliente Prisma e estado
let prisma = new PrismaClient();
let _lastPrismaError = null;
let _lastPrismaDiag = null;

// Prisma query logging (helpful for debugging). Params may contain sensitive data; mask long strings.
try {
  prisma.$on("query", (e) => {
    try {
      const params =
        e.params && typeof e.params === "string"
          ? e.params
          : JSON.stringify(e.params || {});
      console.debug("[prisma] query", {
        query: e.query,
        params: params,
        duration: e.duration,
      });
    } catch (e) {
      console.debug("[prisma] query", e.query, "params omitted");
    }
  });
} catch (e) {
  // ignore if client doesn't support $on in this runtime
}

// Função para obter o cliente Prisma
function getPrisma() {
  return prisma;
}

// Recriar cliente Prisma com diagnóstico
async function recreatePrismaClient() {
  try {
    console.log("Desconectando cliente Prisma existente (se houver)");
    try {
      await prisma.$disconnect();
    } catch (e) {
      // Ignorar erros de desconexão
    }
  } catch (e) {
    // Ignorar
  }

  // Capturar diagnóstico antes de criar o cliente
  try {
    _lastPrismaDiag = {
      timestamp: new Date().toISOString(),
      DATABASE_URL: maskDatabaseUrl(process.env.DATABASE_URL),
      env_PGSSLCERT: process.env.PGSSLCERT || null,
      env_PGSSLKEY: process.env.PGSSLKEY || null,
      env_PGSSLROOTCERT: process.env.PGSSLROOTCERT || null,
    };
    console.log(
      "Diagnóstico de reconexão Prisma:",
      JSON.stringify(_lastPrismaDiag)
    );
  } catch (e) {
    // Ignorar
  }

  prisma = new PrismaClient();
  try {
    await prisma.$connect();
    console.log("Cliente Prisma recriado e conectado com sucesso");
    _lastPrismaError = null;
    return prisma;
  } catch (err) {
    console.log(
      "Falha ao recriar/conectar cliente Prisma:",
      err && err.message ? err.message : String(err)
    );
    _lastPrismaError = err;
    throw err;
  }
}

// Testar conexão com o banco
async function testConnection() {
  try {
    const client = getPrisma();
    await client.$connect();
    await client.$queryRaw`SELECT 1`;
    console.log("Teste de conexão Prisma: OK");
    _lastPrismaError = null;
    return true;
  } catch (err) {
    console.log(
      "Teste de conexão Prisma falhou:",
      err && err.message ? err.message : String(err)
    );
    if (err && err.stack) console.log(err.stack);
    _lastPrismaError = err;
    throw err;
  }
}

// Obter último erro do Prisma
function getLastPrismaError() {
  return { error: _lastPrismaError, diag: _lastPrismaDiag };
}

// Diagnóstico inicial de certificados
try {
  const certDir = path.join(__dirname, "..", "prisma", "certs");
  const diag = {
    DATABASE_URL: maskDatabaseUrl(process.env.DATABASE_URL),
    DATABASE_URL_contains: {
      sslidentity: /sslidentity=/i.test(process.env.DATABASE_URL || ""),
      sslcert: /sslcert=/i.test(process.env.DATABASE_URL || ""),
      sslkey: /sslkey=/i.test(process.env.DATABASE_URL || ""),
      sslrootcert: /sslrootcert=/i.test(process.env.DATABASE_URL || ""),
    },
    PRISMA_P12_BASE64: process.env.PRISMA_P12_BASE64
      ? { present: true, length: process.env.PRISMA_P12_BASE64.length }
      : { present: false },
    P12_PASSWORD: process.env.P12_PASSWORD
      ? { present: true, masked: maskValue(process.env.P12_PASSWORD) }
      : { present: false },
    env_PGSSLCERT: process.env.PGSSLCERT || null,
    env_PGSSLKEY: process.env.PGSSLKEY || null,
    env_PGSSLROOTCERT: process.env.PGSSLROOTCERT || null,
    NODE_ENV: process.env.NODE_ENV,
    files: {
      p12: statIfExists(path.join(certDir, "client-identity.p12")),
      certPem: statIfExists(path.join(certDir, "client-cert.pem")),
      keyPem: statIfExists(path.join(certDir, "client-key.pem")),
      caPem: statIfExists(path.join(certDir, "ca-certificate.crt")),
    },
  };
  console.log(
    "Diagnóstico de certificado Prisma/DB:",
    JSON.stringify(diag, null, 2)
  );
} catch (e) {
  console.warn(
    "Falha ao imprimir diagnósticos de certificado Prisma:",
    e && e.message ? e.message : e
  );
}

module.exports = {
  getPrisma,
  testConnection,
  recreatePrismaClient,
  getLastPrismaError,
};
