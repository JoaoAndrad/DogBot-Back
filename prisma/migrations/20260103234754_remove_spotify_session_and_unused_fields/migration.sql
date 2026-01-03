/*
  Warnings:

  - You are about to drop the column `accountType` on the `SpotifyAccount` table. All the data in the column will be lost.
  - You are about to drop the column `clientId` on the `SpotifyAccount` table. All the data in the column will be lost.
  - You are about to drop the column `meta` on the `SpotifyAccount` table. All the data in the column will be lost.
  - You are about to drop the column `scope` on the `SpotifyAccount` table. All the data in the column will be lost.
  - You are about to drop the `SpotifySession` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE "LiveRequest" DROP CONSTRAINT "LiveRequest_handledBySessionId_fkey";

-- DropForeignKey
ALTER TABLE "SpotifySession" DROP CONSTRAINT "SpotifySession_accountId_fkey";

-- AlterTable
ALTER TABLE "SpotifyAccount" DROP COLUMN "accountType",
DROP COLUMN "clientId",
DROP COLUMN "meta",
DROP COLUMN "scope";

-- DropTable
DROP TABLE "SpotifySession";
