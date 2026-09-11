-- CreateTable
CREATE TABLE "DocumentType" (
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "hasExpiry" BOOLEAN NOT NULL DEFAULT false,
    "reminderDaysBefore" INTEGER,
    "retentionMonths" INTEGER,
    "isActive" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "DocumentType_pkey" PRIMARY KEY ("code")
);

-- CreateTable
CREATE TABLE "Document" (
    "id" SERIAL NOT NULL,
    "personId" INTEGER NOT NULL,
    "documentTypeCode" TEXT NOT NULL,
    "filePath" TEXT NOT NULL,
    "originalName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "uploadedById" INTEGER NOT NULL,
    "uploadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3),

    CONSTRAINT "Document_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Equipment" (
    "id" SERIAL NOT NULL,
    "inventoryNo" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "orgNodeId" INTEGER NOT NULL,
    "responsibleId" INTEGER,
    "assignedAt" TIMESTAMP(3),
    "isActive" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "Equipment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Document_personId_idx" ON "Document"("personId");

-- CreateIndex
CREATE UNIQUE INDEX "Equipment_inventoryNo_key" ON "Equipment"("inventoryNo");

-- CreateIndex
CREATE INDEX "Equipment_orgNodeId_idx" ON "Equipment"("orgNodeId");

-- CreateIndex
CREATE INDEX "Equipment_responsibleId_idx" ON "Equipment"("responsibleId");

-- AddForeignKey
ALTER TABLE "Document" ADD CONSTRAINT "Document_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Document" ADD CONSTRAINT "Document_documentTypeCode_fkey" FOREIGN KEY ("documentTypeCode") REFERENCES "DocumentType"("code") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Document" ADD CONSTRAINT "Document_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "Employment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Equipment" ADD CONSTRAINT "Equipment_orgNodeId_fkey" FOREIGN KEY ("orgNodeId") REFERENCES "OrgNode"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Equipment" ADD CONSTRAINT "Equipment_responsibleId_fkey" FOREIGN KEY ("responsibleId") REFERENCES "Employment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

