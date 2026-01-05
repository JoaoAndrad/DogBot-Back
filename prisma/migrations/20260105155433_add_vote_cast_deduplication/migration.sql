/*
  Warnings:

  - Made the column `processed` on table `CollaborativeVote` required. This step will fail if there are existing NULL values in that column.

*/
-- AlterTable
ALTER TABLE "CollaborativeVote" ALTER COLUMN "processed" SET NOT NULL;
