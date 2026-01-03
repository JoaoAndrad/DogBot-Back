const { getPrisma, recreatePrismaClient } = require("../../../db");
const logger = require("../../../lib/logger");

/**
 * Extracts base phone number from WhatsApp identifier
 * Removes @c.us, @s.whatsapp.net, @g.us, @lid suffixes
 * @param {string} identifier - e.g. "558182132346@c.us", "185495510364403@lid"
 * @returns {string} - e.g. "558182132346", "185495510364403"
 */
function extractBaseNumber(identifier) {
  if (!identifier) return "";
  return identifier.replace(/@(c\.us|s\.whatsapp\.net|g\.us|lid)$/i, "");
}

/**
 * Step 1: Find user by exact identifier match in identifiers[] array
 * @param {string} identifier
 * @returns {Promise<User|null>}
 */
async function findByIdentifierExact(identifier) {
  const prisma = getPrisma();
  if (!prisma || !prisma.user) {
    console.log("Prisma client missing 'user' model - attempting recreate");
    await recreatePrismaClient();
    return findByIdentifierExact(identifier);
  }

  return prisma.user.findFirst({
    where: {
      identifiers: {
        has: identifier,
      },
    },
    include: {
      pushNameHistory: {
        orderBy: { ts: "desc" },
        take: 5,
      },
    },
  });
}

/**
 * Step 2: Find user by base number (strips @c.us/@lid suffixes)
 * @param {string} baseNumber
 * @returns {Promise<User|null>}
 */
async function findByBaseNumber(baseNumber) {
  const prisma = getPrisma();
  if (!prisma || !prisma.user) {
    console.log("Prisma client missing 'user' model - attempting recreate");
    await recreatePrismaClient();
    return findByBaseNumber(baseNumber);
  }

  // Find users where any identifier starts with base number
  const users = await prisma.user.findMany({
    where: {
      identifiers: {
        hasSome: [
          baseNumber,
          `${baseNumber}@c.us`,
          `${baseNumber}@s.whatsapp.net`,
        ],
      },
    },
    include: {
      pushNameHistory: {
        orderBy: { ts: "desc" },
        take: 5,
      },
    },
  });

  return users.length > 0 ? users[0] : null;
}

/**
 * Step 3: Find user by push_name (only if unique match)
 * @param {string} pushName
 * @returns {Promise<User|null>}
 */
async function findByPushNameUnique(pushName) {
  const prisma = getPrisma();
  if (!prisma || !prisma.user) {
    console.log("Prisma client missing 'user' model - attempting recreate");
    await recreatePrismaClient();
    return findByPushNameUnique(pushName);
  }

  if (!pushName) return null;

  const users = await prisma.user.findMany({
    where: {
      push_name: pushName,
    },
    include: {
      pushNameHistory: {
        orderBy: { ts: "desc" },
        take: 5,
      },
    },
  });

  if (users.length === 1) {
    return users[0];
  } else if (users.length > 1) {
    console.log(
      `[USER_COLLISION] Multiple users (${
        users.length
      }) found with push_name="${pushName}". Cannot auto-link. User IDs: ${users
        .map((u) => u.id)
        .join(", ")}`
    );
    return null;
  }

  return null;
}

/**
 * Adds a new identifier to user's identifiers array if not already present
 * @param {string} userId
 * @param {string} identifier
 * @returns {Promise<User>}
 */
async function addIdentifierToUser(userId, identifier) {
  const prisma = getPrisma();
  if (!prisma || !prisma.user) {
    console.log("Prisma client missing 'user' model - attempting recreate");
    await recreatePrismaClient();
    return addIdentifierToUser(userId, identifier);
  }

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { identifiers: true },
  });

  if (!user) {
    throw new Error(`User ${userId} not found`);
  }

  // Only add if not already present
  if (!user.identifiers.includes(identifier)) {
    return prisma.user.update({
      where: { id: userId },
      data: {
        identifiers: {
          push: identifier,
        },
      },
    });
  }

  return prisma.user.findUnique({ where: { id: userId } });
}

/**
 * Updates user's push_name and maintains push_name_history (max 5 entries)
 * @param {string} userId
 * @param {string} newPushName
 * @param {string} observedFrom - chat_id or source
 * @param {string} observedLid - LID if from group
 * @returns {Promise<User>}
 */
async function updatePushNameWithHistory(
  userId,
  newPushName,
  observedFrom,
  observedLid = null
) {
  const prisma = getPrisma();
  if (!prisma || !prisma.user) {
    console.log("Prisma client missing 'user' model - attempting recreate");
    await recreatePrismaClient();
    return updatePushNameWithHistory(
      userId,
      newPushName,
      observedFrom,
      observedLid
    );
  }

  if (!newPushName) return prisma.user.findUnique({ where: { id: userId } });

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { push_name: true },
  });

  if (!user) {
    throw new Error(`User ${userId} not found`);
  }

  // Only update if push_name is different
  if (user.push_name !== newPushName) {
    const oldPushName = user.push_name;

    // Update main push_name field
    await prisma.user.update({
      where: { id: userId },
      data: {
        push_name: newPushName,
      },
    });

    // Add old push_name to history if it was set
    if (oldPushName) {
      await prisma.pushNameHistory.create({
        data: {
          user_id: userId,
          push_name: oldPushName,
          observed_from: observedFrom,
          observed_lid: observedLid,
          ts: BigInt(Date.now()),
        },
      });

      // Keep only last 5 entries
      const allHistory = await prisma.pushNameHistory.findMany({
        where: { user_id: userId },
        orderBy: { ts: "desc" },
      });

      if (allHistory.length > 5) {
        const toDelete = allHistory.slice(5);
        await prisma.pushNameHistory.deleteMany({
          where: {
            id: {
              in: toDelete.map((h) => h.id),
            },
          },
        });
      }
    }
  }

  return prisma.user.findUnique({
    where: { id: userId },
    include: {
      pushNameHistory: {
        orderBy: { ts: "desc" },
        take: 5,
      },
    },
  });
}

/**
 * Main function: Find existing user by multiple strategies or create new one
 * Priority: identifier exact → base number → push_name unique → create new
 *
 * @param {Object} params
 * @param {string} params.identifier - WhatsApp identifier (e.g. "558182132346@c.us", "185495510364403@lid")
 * @param {string} params.push_name - User's WhatsApp push name
 * @param {string} params.display_name - Display name from message
 * @param {string} params.observed_from - chat_id or source where user was observed
 * @param {string} params.observed_lid - LID if observed in group
 * @returns {Promise<User>} - User record with UUID id
 */
async function findOrCreateUser({
  identifier,
  push_name,
  display_name,
  observed_from,
  observed_lid = null,
}) {
  const prisma = getPrisma();
  if (!prisma || !prisma.user) {
    console.log("Prisma client missing 'user' model - attempting recreate");
    await recreatePrismaClient();
    return findOrCreateUser({
      identifier,
      push_name,
      display_name,
      observed_from,
      observed_lid,
    });
  }

  // Step 1: Try exact identifier match
  let user = await findByIdentifierExact(identifier);
  if (user) {
    console.log(
      `[findOrCreateUser] Found by identifier exact: ${identifier} → user ${user.id}`
    );

    // Update metadata
    await addIdentifierToUser(user.id, identifier);
    await updatePushNameWithHistory(
      user.id,
      push_name,
      observed_from,
      observed_lid
    );

    // Update last_seen, display_name
    user = await prisma.user.update({
      where: { id: user.id },
      data: {
        last_seen: new Date(),
        display_name: display_name || user.display_name,
        last_known_lid: observed_lid || user.last_known_lid,
      },
    });

    return user;
  }

  // Step 2: Try base number match
  const baseNumber = extractBaseNumber(identifier);
  if (baseNumber && baseNumber !== identifier) {
    user = await findByBaseNumber(baseNumber);
    if (user) {
      console.log(
        `[findOrCreateUser] Found by base number: ${baseNumber} → user ${user.id}`
      );

      // Add new identifier variant
      await addIdentifierToUser(user.id, identifier);
      await updatePushNameWithHistory(
        user.id,
        push_name,
        observed_from,
        observed_lid
      );

      user = await prisma.user.update({
        where: { id: user.id },
        data: {
          last_seen: new Date(),
          display_name: display_name || user.display_name,
          last_known_lid: observed_lid || user.last_known_lid,
        },
      });

      return user;
    }
  }

  // Step 3: Try push_name match (only if unique)
  if (push_name) {
    user = await findByPushNameUnique(push_name);
    if (user) {
      console.log(
        `[findOrCreateUser] Found by unique push_name: "${push_name}" → user ${user.id}`
      );

      // Link new identifier to existing user
      await addIdentifierToUser(user.id, identifier);

      user = await prisma.user.update({
        where: { id: user.id },
        data: {
          last_seen: new Date(),
          display_name: display_name || user.display_name,
          last_known_lid: observed_lid || user.last_known_lid,
        },
      });

      return user;
    }
  }

  // Step 4: Create new user
  console.log(
    `[findOrCreateUser] Creating new user for identifier: ${identifier}`
  );

  user = await prisma.user.create({
    data: {
      sender_number: identifier,
      identifiers: [identifier],
      push_name: push_name,
      display_name: display_name,
      last_seen: new Date(),
      last_known_lid: observed_lid,
    },
    include: {
      pushNameHistory: true,
    },
  });

  return user;
}

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
      console.log(
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
    const upsertRes = await prisma.dogFortStats.upsert({
      where: { user_id: userId },
      update: normalized,
      create: Object.assign({ user_id: userId }, normalized),
    });

    // If a 'plan' was provided, also persist it into user.metadata.raw.plan
    try {
      if (typeof normalized.plan !== "undefined") {
        const user = await prisma.user.findUnique({
          where: { id: userId },
          select: { metadata: true },
        });
        const existingMeta = (user && user.metadata) || {};
        const existingRaw = existingMeta.raw || {};
        existingRaw.plan = normalized.plan;
        const newMeta = Object.assign({}, existingMeta, { raw: existingRaw });
        await prisma.user.update({
          where: { id: userId },
          data: { metadata: newMeta },
        });
      }
    } catch (e) {
      console.log(
        "Failed to persist plan into metadata.raw for user",
        userId,
        e && e.message ? e.message : e
      );
      // don't fail the overall operation if metadata update fails
    }

    return upsertRes;
  } catch (e) {
    console.log(
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
  // New multi-identifier functions
  findOrCreateUser,
  findByIdentifierExact,
  findByBaseNumber,
  findByPushNameUnique,
  extractBaseNumber,
  addIdentifierToUser,
  updatePushNameWithHistory,
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
