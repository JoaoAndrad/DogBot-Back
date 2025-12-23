#!/usr/bin/env node
const { getPrisma, recreatePrismaClient } = require("../src/db");

// Simple fake data generator (no external deps)
function randInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

const firstNames = [
  "Ana",
  "João",
  "Carlos",
  "Mariana",
  "Lucas",
  "Sofia",
  "Pedro",
  "Clara",
  "Rafael",
  "Beatriz",
];
const lastNames = [
  "Silva",
  "Souza",
  "Oliveira",
  "Costa",
  "Pereira",
  "Almeida",
  "Lima",
  "Gomes",
  "Ramos",
  "Martins",
];

function randomName() {
  return `${firstNames[randInt(0, firstNames.length - 1)]} ${
    lastNames[randInt(0, lastNames.length - 1)]
  }`;
}

function randomPhone(nextSeed = null) {
  // Generate brazilian-like phone: +55 9 8-digit
  const area = randInt(11, 99);
  const subscriber = String(randInt(10000000, 99999999));
  return `+55${area}9${subscriber}`;
}

async function ensureUniquePhone(prisma, attempt = 0) {
  if (attempt > 50) throw new Error("Failed to generate unique phone");
  const phone = randomPhone();
  const exists = await prisma.user.findUnique({
    where: { sender_number: phone },
  });
  if (exists) return ensureUniquePhone(prisma, attempt + 1);
  return phone;
}

async function seedOnce(count = 10) {
  const prisma = getPrisma();
  let created = 0;
  for (let i = 0; i < count; i++) {
    try {
      const sender_number = await ensureUniquePhone(prisma);
      const display_name = randomName();
      const push_name = display_name.split(" ")[0];
      const now = new Date();
      await prisma.user.create({
        data: {
          sender_number,
          display_name,
          push_name,
          created_at: now,
          last_seen: now,
          metadata: { seeded: true },
        },
      });
      created++;
    } catch (e) {
      console.error("seed error", e && e.message ? e.message : e);
    }
  }
  console.log(`Seed complete — created ${created}/${count} users`);
  return created;
}

async function main() {
  const raw = process.argv.slice(2);
  const argv = {};
  for (const a of raw) {
    if (a.startsWith("--")) {
      const [k, v] = a.slice(2).split("=");
      argv[k] = typeof v === "undefined" ? true : v;
    } else if (a.startsWith("-")) {
      const flags = a.slice(1).split("");
      for (const f of flags) argv[f] = true;
    }
  }
  const count = parseInt(argv.count || argv.c, 10) || 10;
  const daemon = Boolean(argv.daemon || argv.d);
  const intervalMinutes = parseInt(argv.interval || argv.i, 10) || 60;

  if (!daemon) {
    await seedOnce(count);
    process.exit(0);
  }

  console.log(
    `Starting daemon seeder — interval ${intervalMinutes} minutes, ${count} per run`
  );
  await seedOnce(count);
  setInterval(async () => {
    try {
      // try to recreate client to avoid long-lived connection issues
      await recreatePrismaClient();
      await seedOnce(count);
    } catch (e) {
      console.error("Daemon seed error", e && e.message ? e.message : e);
    }
  }, Math.max(1, intervalMinutes) * 60 * 1000);
}

if (require.main === module) {
  main().catch((e) => {
    console.error(e && e.message ? e.message : e);
    process.exit(1);
  });
}

module.exports = { seedOnce };
