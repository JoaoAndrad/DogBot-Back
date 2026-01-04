const { getPrisma } = require("../db");

function todayDateString() {
  const d = new Date();
  // store as ISO date string without time for easy comparison
  return d.toISOString().slice(0, 10);
}

async function resolveUserBySenderNumber(senderNumber) {
  const prisma = getPrisma();
  if (!senderNumber) return null;

  // Try exact sender_number
  let user = await prisma.user.findUnique({
    where: { sender_number: senderNumber },
  });
  if (user) return user;

  // Try identifiers array
  const usersByIdentifier = await prisma.user.findMany({
    where: { identifiers: { has: senderNumber } },
    take: 1,
  });
  if (usersByIdentifier && usersByIdentifier.length > 0)
    return usersByIdentifier[0];

  // Try last_known_lid
  const usersByLid = await prisma.user.findMany({
    where: { last_known_lid: senderNumber },
    take: 1,
  });
  if (usersByLid && usersByLid.length > 0) return usersByLid[0];

  return null;
}

async function resetDailyIfNeeded(user) {
  const prisma = getPrisma();
  if (!user) return;
  const today = todayDateString();
  const last = user.confessions_last_update
    ? new Date(user.confessions_last_update).toISOString().slice(0, 10)
    : null;
  if (last !== today) {
    // reset to default 5
    await prisma.user.update({
      where: { id: user.id },
      data: { confessions_balance: 5, confessions_last_update: new Date() },
    });
    // return updated user
    const updated = await prisma.user.findUnique({ where: { id: user.id } });
    return updated;
  }
  return user;
}

async function getBalance(senderNumber) {
  const prisma = getPrisma();
  const user = await resolveUserBySenderNumber(senderNumber);
  if (!user) return null;
  const updated = await resetDailyIfNeeded(user);
  const effective = updated || user;
  if (effective.confessions_vip) return Infinity;
  return effective.confessions_balance || 0;
}

async function consumeBalance(senderNumber) {
  const prisma = getPrisma();
  const user = await resolveUserBySenderNumber(senderNumber);
  if (!user) throw new Error("user_not_found");

  // Ensure daily reset
  const current = await resetDailyIfNeeded(user);
  const effective = current || user;

  if (effective.confessions_vip) {
    return { success: true, remaining: Infinity };
  }

  // Atomic decrement: only when balance >= 1
  const res = await prisma.user.updateMany({
    where: { id: effective.id, confessions_balance: { gte: 1 } },
    data: {
      confessions_balance: { decrement: 1 },
      confessions_last_update: new Date(),
    },
  });

  if (res.count === 0) {
    return { success: false, reason: "insufficient_balance" };
  }

  const after = await prisma.user.findUnique({ where: { id: effective.id } });
  return { success: true, remaining: after.confessions_balance };
}

// Admin helper to force reset all users (can be used by cron or admin endpoint)
async function resetAllBalancesIfNeeded() {
  const prisma = getPrisma();
  const today = todayDateString();
  // Reset users whose confessions_last_update is not today
  const res = await prisma.user.updateMany({
    where: {
      OR: [
        { confessions_last_update: null },
        { confessions_last_update: { lt: new Date(today) } },
      ],
    },
    data: { confessions_balance: 5, confessions_last_update: new Date() },
  });
  return res.count;
}

module.exports = {
  resolveUserBySenderNumber,
  getBalance,
  consumeBalance,
  resetDailyIfNeeded,
  resetAllBalancesIfNeeded,
};
