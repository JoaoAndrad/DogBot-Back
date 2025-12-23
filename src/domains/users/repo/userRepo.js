const { getPrisma } = require("../../../db");

async function findUsers({ page = 1, per_page = 20, q, platform, is_active }) {
  const prisma = getPrisma();
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
  const prisma = getPrisma();
  return prisma.user.findUnique({ where: { id } });
}

async function upsertBySenderNumber(data) {
  const prisma = getPrisma();
  const { sender_number, ...rest } = data;
  return prisma.user.upsert({
    where: { sender_number },
    update: rest,
    create: { sender_number, ...rest },
  });
}

async function createUser(data) {
  const prisma = getPrisma();
  return prisma.user.create({ data });
}

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

module.exports = {
  findUsers,
  findUserById,
  upsertBySenderNumber,
  createUser,
  updateUserById,
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
