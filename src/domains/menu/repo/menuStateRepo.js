// Repository for MenuState - handles navigation state persistence
const db = require("../../../db");

/**
 * Upsert menu state for a user+flow
 * @param {string} userId - WhatsApp user identifier
 * @param {string} flowId - Flow identifier (e.g., 'spotify')
 * @param {object} data - { path, history, context, expiresAt }
 * @returns {Promise<MenuState>}
 */
async function upsert(userId, flowId, data) {
  const prisma = db.getPrisma();

  const payload = {
    userId: String(userId),
    flowId: String(flowId),
    path: data.path || "/",
    history: data.history || null,
    context: data.context || null,
    expiresAt: data.expiresAt || null,
  };

  return prisma.menuState.upsert({
    where: {
      userId_flowId: {
        userId: String(userId),
        flowId: String(flowId),
      },
    },
    update: {
      path: payload.path,
      history: payload.history,
      context: payload.context,
      expiresAt: payload.expiresAt,
      updatedAt: new Date(),
    },
    create: payload,
  });
}

/**
 * Get menu state by userId and flowId
 * @param {string} userId
 * @param {string} flowId
 * @returns {Promise<MenuState|null>}
 */
async function get(userId, flowId) {
  const prisma = db.getPrisma();
  return prisma.menuState.findUnique({
    where: {
      userId_flowId: {
        userId: String(userId),
        flowId: String(flowId),
      },
    },
  });
}

/**
 * Delete menu state
 * @param {string} userId
 * @param {string} flowId
 * @returns {Promise<MenuState>}
 */
async function remove(userId, flowId) {
  const prisma = db.getPrisma();
  return prisma.menuState.delete({
    where: {
      userId_flowId: {
        userId: String(userId),
        flowId: String(flowId),
      },
    },
  });
}

/**
 * List all states for a user
 * @param {string} userId
 * @returns {Promise<MenuState[]>}
 */
async function listByUser(userId) {
  const prisma = db.getPrisma();
  return prisma.menuState.findMany({
    where: { userId: String(userId) },
    orderBy: { updatedAt: "desc" },
  });
}

/**
 * Clean up expired states
 * @returns {Promise<{count: number}>}
 */
async function cleanupExpired() {
  const prisma = db.getPrisma();
  const now = new Date();
  return prisma.menuState.deleteMany({
    where: {
      expiresAt: {
        lte: now,
      },
    },
  });
}

module.exports = {
  upsert,
  get,
  remove,
  listByUser,
  cleanupExpired,
};
