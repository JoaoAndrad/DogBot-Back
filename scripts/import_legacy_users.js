const fs = require("fs");
const path = require("path");
const { PrismaClient } = require("@prisma/client");
const readline = require("readline");

// Inicializa o cliente
const prisma = new PrismaClient();

async function importUsers() {
  const file = path.join(__dirname, "..", "legados", "users_export.json");

  // 1. Verifica arquivo
  if (!fs.existsSync(file)) {
    console.error(
      `[${new Date().toISOString()}] Legacy export file not found: ${file}`
    );
    process.exit(1);
  }

  // 2. Lê e processa
  const raw = JSON.parse(fs.readFileSync(file, "utf8"));
  console.log(
    `[${new Date().toISOString()}] Users found in legacy export: ${raw.length}`
  );

  // 3. Normaliza os dados
  const normalized = raw.map((u) => {
    const sender =
      u.senderNumber ||
      (Array.isArray(u.identifiers) && u.identifiers.find(Boolean)) ||
      null;

    const userData = {
      sender_number: sender ? String(sender) : null,
      identifiers: Array.isArray(u.identifiers)
        ? u.identifiers.map(String)
        : [],
      display_name: u.name || u.id || null,
      push_name: u.lastPushName || null,
      created_at: parseDate(u.createdAt) || null,
      last_seen: parseDate(u.lastSeen) || null,
      last_group_activity: parseDate(u.lastGroupActivity) || null,
      last_known_lid: u.lastKnownLid || null,
      confissoes: u.confissoes || null,
      metadata: { legacy_id: u.id },
    };

    const saldoFromConf =
      u.confissoes && "saldo" in u.confissoes
        ? toInt(u.confissoes.saldo)
        : null;

    const dogData = {
      saldo: saldoFromConf,
      mensal: toInt(u.mensal) || 0,
      anual: toInt(u.anual) || 0,
      meta_anual: toInt(u.metaAnual) || toInt(u.meta_anual) || null,
      trofeus: toInt(u.trofeus) || 0,
      ultimo_treino: parseDate(u.ultimoTreino) || null,
    };

    const pushHistory = Array.isArray(u.pushNameHistory)
      ? u.pushNameHistory.map((ph) => ({
          observed_from: ph.observedFrom || ph.observed_from || null,
          observed_lid: ph.observedLid || ph.observed_lid || null,
          push_name: ph.pushName || ph.push_name || null,
          ts: ph.ts || ph.TS || null,
        }))
      : [];

    return { legacyId: u.id, sender, userData, dogData, pushHistory, raw: u };
  });

  // 4. Preview
  console.log("\n=== Normalized data preview ===");
  normalized.slice(0, 3).forEach((n, i) => {
    console.log(`Preview ${i + 1}: legacyId=${n.legacyId} sender=${n.sender}`);
  });
  console.log(`... (${normalized.length} total)`);

  // 5. Confirmação
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  const answer = await new Promise((resolve) => {
    rl.question("\nConfirma importação? (y/n): ", (ans) => {
      rl.close();
      resolve(ans && ans.trim().toLowerCase());
    });
  });

  if (answer !== "y" && answer !== "yes") {
    console.log("Cancelado.");
    return;
  }

  // 6. Limpeza
  if (typeof clearDatabase === "function") {
    await clearDatabase();
  }

  // 7. Loop de Inserção com Logs Detalhados
  let imported = 0;
  const total = normalized.length;

  console.log(`[${new Date().toISOString()}] Starting import loop...`);

  for (let i = 0; i < normalized.length; i++) {
    const n = normalized[i];
    const idx = i + 1;
    const ts = () => `[${new Date().toISOString()}]`;

    try {
      console.log(
        `${ts()} [${idx}/${total}] Start processing legacyId=${
          n.legacyId
        } sender=${n.sender}`
      );

      if (!n.sender) {
        console.warn(`${ts()} [${idx}/${total}] SKIP: No sender found.`);
        continue;
      }

      // Prepara User Data
      const userData = {
        ...n.userData,
        metadata: { ...n.userData.metadata, raw: n.raw },
      };
      if (userData.created_at === null) delete userData.created_at;

      // 1. Create User
      const user = await prisma.user.create({ data: userData });
      console.log(`${ts()} [${idx}/${total}] OK: User created (id=${user.id})`);

      // 2. Create Dog Stats
      const dogData = { user_id: user.id, ...n.dogData };
      await prisma.dogFortStats.create({ data: dogData });
      console.log(`${ts()} [${idx}/${total}] OK: DogStats created`);

      // 3. Create Push History
      if (n.pushHistory && n.pushHistory.length) {
        let pushCount = 0;
        for (const ph of n.pushHistory) {
          try {
            await prisma.pushNameHistory.create({
              data: {
                user_id: user.id,
                observed_from: ph.observed_from,
                observed_lid: ph.observed_lid,
                push_name: ph.push_name,
                ts: ph.ts ? BigInt(ph.ts) : null,
              },
            });
            pushCount++;
          } catch (e) {
            // Ignora erro individual
          }
        }
        console.log(
          `${ts()} [${idx}/${total}] OK: PushHistory finished (${pushCount} entries)`
        );
      } else {
        console.log(`${ts()} [${idx}/${total}] INFO: No PushHistory to import`);
      }

      imported++;
    } catch (err) {
      console.error(`${ts()} [${idx}/${total}] ERROR: ${err.message}`);
    }
  }

  console.log(
    `[${new Date().toISOString()}] Import finished. Total successfully imported: ${imported}/${total}`
  );
}

// === Helpers ===

function parseDate(s) {
  if (!s) return null;
  if (typeof s !== "string") return null;
  if (s.includes("T")) {
    const d = new Date(s);
    return isNaN(d.getTime()) ? null : d;
  }
  const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (m) {
    const dd = parseInt(m[1], 10);
    const mm = parseInt(m[2], 10) - 1;
    const yy = parseInt(m[3], 10);
    const d = new Date(Date.UTC(yy, mm, dd));
    return isNaN(d.getTime()) ? null : d;
  }
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d;
}

function toInt(v) {
  if (v === null || v === undefined) return null;
  if (typeof v === "number") return v;
  const n = parseInt(String(v).replace(/[^0-9-]/g, ""), 10);
  return Number.isNaN(n) ? null : n;
}

async function clearDatabase() {
  console.log(`[${new Date().toISOString()}] Wiping database tables...`);
  const models = [
    "playlistEntry",
    "trackNote",
    "trackVote",
    "trackPlayback",
    "currentPlayback",
    "trackStat",
    "track",
    "spotifyToken",
    "spotifyAccount",
    "userListeningSummary",
    "pushNameHistory",
    "dogFortStats",
    "user",
    "message",
    "vote",
    "poll",
  ];

  for (const m of models) {
    try {
      if (prisma[m] && typeof prisma[m].deleteMany === "function") {
        await prisma[m].deleteMany();
        console.log(` - cleared ${m}`);
      }
    } catch (err) {
      // Ignora erro se tabela não existir ou erro de FK
    }
  }
}

// === Main ===

(async () => {
  try {
    await importUsers();
  } catch (err) {
    console.error("Fatal error:", err);
  } finally {
    await prisma.$disconnect();
  }
})();
