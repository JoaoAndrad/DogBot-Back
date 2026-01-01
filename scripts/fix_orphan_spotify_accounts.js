/**
 * Script to fix orphaned SpotifyAccounts that don't have a userId
 * Uses meta.externalId to resolve the WhatsApp identifier to User.id
 */

const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

const userRepo = require("../src/domains/users/repo/userRepo");

async function fixOrphanAccounts() {
  console.log("[FixOrphanAccounts] Starting...");

  // Find all accounts without userId but with meta.externalId
  const orphans = await prisma.spotifyAccount.findMany({
    where: {
      userId: null,
      meta: { not: null },
    },
  });

  console.log(`[FixOrphanAccounts] Found ${orphans.length} orphaned accounts`);

  let fixed = 0;
  let failed = 0;

  for (const account of orphans) {
    const externalId = account.meta?.externalId;
    if (!externalId) {
      console.log(
        `[FixOrphanAccounts] Account ${account.id} has no externalId, skipping`
      );
      continue;
    }

    console.log(
      `[FixOrphanAccounts] Processing account ${account.id} with externalId: ${externalId}`
    );

    try {
      // Try to find user by identifier
      let user = await userRepo.findByIdentifierExact(externalId);

      if (!user) {
        // Try by base number
        const baseNumber = userRepo.extractBaseNumber(externalId);
        user = await userRepo.findByBaseNumber(baseNumber);
      }

      if (user) {
        // Update account with resolved userId
        await prisma.spotifyAccount.update({
          where: { id: account.id },
          data: {
            userId: user.id,
            meta: {
              ...account.meta,
              resolvedAt: new Date().toISOString(),
              originalExternalId: externalId,
            },
          },
        });
        console.log(
          `[FixOrphanAccounts] ✅ Fixed account ${account.id} → User ${user.id}`
        );
        fixed++;
      } else {
        console.log(
          `[FixOrphanAccounts] ❌ Could not resolve externalId ${externalId} to any User`
        );
        failed++;
      }
    } catch (err) {
      console.log(
        `[FixOrphanAccounts] Error processing account ${account.id}:`,
        err.message
      );
      failed++;
    }
  }

  console.log(`[FixOrphanAccounts] Done! Fixed: ${fixed}, Failed: ${failed}`);
  await prisma.$disconnect();
}

fixOrphanAccounts().catch((err) => {
  console.log("[FixOrphanAccounts] Fatal error:", err);
  process.exit(1);
});
