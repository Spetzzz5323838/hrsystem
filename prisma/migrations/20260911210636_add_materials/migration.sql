-- CreateEnum
CREATE TYPE "MaterialType" AS ENUM ('PDF', 'VIDEO', 'LINK');

-- CreateTable
CREATE TABLE "Material" (
    "id" SERIAL NOT NULL,
    "competencyId" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "type" "MaterialType" NOT NULL,
    "url" TEXT,
    "filePath" TEXT,
    "durationMin" INTEGER,
    "sendViaBot" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "Material_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Material_competencyId_idx" ON "Material"("competencyId");

-- AddForeignKey
ALTER TABLE "Material" ADD CONSTRAINT "Material_competencyId_fkey" FOREIGN KEY ("competencyId") REFERENCES "Competency"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

