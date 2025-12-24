const { getPrisma, recreatePrismaClient } = require("../../../db");

async function findUsers({ page = 1, per_page = 20, q, platform, is_active }) {
  let prisma = getPrisma();
  if (!prisma || !prisma.user) {
    console.warn(
      "Prisma client missing 'user' model - attempting to recreate client"
    );
    try {
      await recreatePrismaClient();
      prisma = getPrisma();
    } catch (e) {
      console.error(
        "recreatePrismaClient failed",
        e && e.message ? e.message : e
      );
      throw e;
    }
  }
  const skip = (Math.max(1, page) - 1) * per_page;
  const where = {};
  if (q) {
    where.OR = [
      { display_name: { contains: q, mode: "insensitive" } },
      { sender_number: { contains: q } },
    ];
  }
  if (typeof is_active !== "undefined") {
    where.metadata = { not: null };
  }
  const [items, total] = await Promise.all([
    prisma.user.findMany({
      where,
      skip,
      take: per_page,
      orderBy: { created_at: "desc" },
    }),
    prisma.user.count({ where }),
  ]);
  return { items, total, page, per_page };
}

async function findUserById(id) {
  let prisma = getPrisma();
  if (!prisma || !prisma.user) {
    console.warn(
      "Prisma client missing 'user' model on findUserById - attempting recreate"
    );
    await recreatePrismaClient();
    prisma = getPrisma();
  }
  return prisma.user.findUnique({
    where: { id },
    include: {
      dogfort: true,
      pushNameHistory: true,
    },
  });
}

async function upsertBySenderNumber(data) {
  let prisma = getPrisma();
  if (!prisma || !prisma.user) {
    console.warn(
      "Prisma client missing 'user' model on upsertBySenderNumber - attempting recreate"
    );
    await recreatePrismaClient();
    prisma = getPrisma();
  }
  const { sender_number, ...rest } = data;
  return prisma.user.upsert({
    where: { sender_number },
    update: rest,
    create: { sender_number, ...rest },
  });
}

async function createUser(data) {
  let prisma = getPrisma();
  if (!prisma || !prisma.user) {
    console.warn(
      "Prisma client missing 'user' model on createUser - attempting recreate"
    );
    await recreatePrismaClient();
    prisma = getPrisma();
  }
  return prisma.user.create({ data });
}

async function updateUserById(id, data) {
  let prisma = getPrisma();
  if (!prisma || !prisma.user) {
    console.warn(
      "Prisma client missing 'user' model on updateUserById - attempting recreate"
    );
    await recreatePrismaClient();
    prisma = getPrisma();
  }
  return prisma.user.update({ where: { id }, data });
}

async function upsertDogfortForUser(userId, dogData) {
  let prisma = getPrisma();
  if (!prisma || !prisma.dogFortStats) {
    console.warn(
      "Prisma client missing 'dogFortStats' model on upsertDogfortForUser - attempting recreate"
    );
    await recreatePrismaClient();
    prisma = getPrisma();
  }

  // Normalize keys: accept either camelCase or snake_case
  const normalized = {};
  if (typeof dogData.saldo !== "undefined") normalized.saldo = dogData.saldo;
  if (typeof dogData.mensal !== "undefined") normalized.mensal = dogData.mensal;
  if (typeof dogData.anual !== "undefined") normalized.anual = dogData.anual;
  if (typeof dogData.plan !== "undefined") normalized.plan = dogData.plan;
  if (typeof dogData.trofeus !== "undefined")
    normalized.trofeus = dogData.trofeus;
  if (typeof dogData.meta_anual !== "undefined")
    normalized.meta_anual = dogData.meta_anual;
  if (typeof dogData.metaAnual !== "undefined")
    normalized.meta_anual = dogData.metaAnual;
  if (typeof dogData.ultimo_treino !== "undefined")
    normalized.ultimo_treino = dogData.ultimo_treino;
  if (typeof dogData.ultimoTreino !== "undefined")
    normalized.ultimo_treino = dogData.ultimoTreino;

  // attempt upsert by user_id
  try {
    return await prisma.dogFortStats.upsert({
      where: { user_id: userId },
      update: normalized,
      create: Object.assign({ user_id: userId }, normalized),
    });
  } catch (e) {
    console.error(
      "Failed to upsert DogFortStats",
      e && e.message ? e.message : e
    );
    throw e;
  }
}

async function deleteUserById(id) {
  let prisma = getPrisma();
  if (!prisma || !prisma.user) {
    console.warn(
      "Prisma client missing 'user' model on deleteUserById - attempting recreate"
    );
    await recreatePrismaClient();
    prisma = getPrisma();
  }
  return prisma.user.delete({ where: { id } });
}

async function bulkAction({ ids = [], action } = {}) {
  let prisma = getPrisma();
  if (!prisma || !prisma.user) {
    console.warn(
      "Prisma client missing 'user' model on bulkAction - attempting recreate"
    );
    await recreatePrismaClient();
    prisma = getPrisma();
  }
  if (!Array.isArray(ids) || !ids.length) return { count: 0 };
  if (action === "delete") {
    const res = await prisma.user.deleteMany({ where: { id: { in: ids } } });
    return { count: res.count };
  }
  // future actions can be handled here
  return { count: 0 };
}

module.exports = {
  findUsers,
  findUserById,
  upsertBySenderNumber,
  createUser,
  updateUserById,
  upsertDogfortForUser,
  deleteUserById,
  bulkAction,
};

async function updateUserById(id, data) {
  const prisma = getPrisma();
  return prisma.user.update({ where: { id }, data });
}

async function deleteUserById(id) {
  const prisma = getPrisma();
  return prisma.user.delete({ where: { id } });
}

async function bulkAction({ ids = [], action } = {}) {
  const prisma = getPrisma();
  if (!Array.isArray(ids) || !ids.length) return { count: 0 };
  if (action === "delete") {
    const res = await prisma.user.deleteMany({ where: { id: { in: ids } } });
    return { count: res.count };
  }
  // future actions can be handled here
  return { count: 0 };
}
