-- AlterTable
ALTER TABLE "User" ADD COLUMN     "confessions_balance" INTEGER NOT NULL DEFAULT 5,
ADD COLUMN     "confessions_last_update" TIMESTAMP(3),
ADD COLUMN     "confessions_vip" BOOLEAN NOT NULL DEFAULT false;
