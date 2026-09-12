-- AlterTable
ALTER TABLE "Person" ADD COLUMN     "email" TEXT;

-- CreateTable
CREATE TABLE "PendingHire" (
    "id" SERIAL NOT NULL,
    "fullName" TEXT NOT NULL,
    "birthDate" TIMESTAMP(3) NOT NULL,
    "phone" TEXT NOT NULL,
    "email" TEXT,
    "telegramId" BIGINT NOT NULL,
    "orgNodeId" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PendingHire_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PendingHire_telegramId_key" ON "PendingHire"("telegramId");

-- CreateIndex
CREATE INDEX "PendingHire_orgNodeId_idx" ON "PendingHire"("orgNodeId");

-- AddForeignKey
ALTER TABLE "PendingHire" ADD CONSTRAINT "PendingHire_orgNodeId_fkey" FOREIGN KEY ("orgNodeId") REFERENCES "OrgNode"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

