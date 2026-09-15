-- DropForeignKey
ALTER TABLE "PermissionGrant" DROP CONSTRAINT "PermissionGrant_customNodeId_fkey";

-- DropForeignKey
ALTER TABLE "PermissionGrant" DROP CONSTRAINT "PermissionGrant_positionProfileId_fkey";

-- DropTable
DROP TABLE "PermissionGrant";

-- CreateTable
CREATE TABLE "AccessProfile" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,

    CONSTRAINT "AccessProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AccessProfileCapability" (
    "id" SERIAL NOT NULL,
    "accessProfileId" INTEGER NOT NULL,
    "capability" "Capability" NOT NULL,

    CONSTRAINT "AccessProfileCapability_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PositionAccessAssignment" (
    "id" SERIAL NOT NULL,
    "positionProfileId" INTEGER,
    "role" "Role",
    "accessProfileId" INTEGER NOT NULL,
    "scope" "ScopeType" NOT NULL,
    "customNodeId" INTEGER,

    CONSTRAINT "PositionAccessAssignment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AccessProfile_name_key" ON "AccessProfile"("name");

-- CreateIndex
CREATE UNIQUE INDEX "AccessProfileCapability_accessProfileId_capability_key" ON "AccessProfileCapability"("accessProfileId", "capability");

-- CreateIndex
CREATE INDEX "PositionAccessAssignment_positionProfileId_idx" ON "PositionAccessAssignment"("positionProfileId");

-- CreateIndex
CREATE INDEX "PositionAccessAssignment_role_idx" ON "PositionAccessAssignment"("role");

-- AddForeignKey
ALTER TABLE "AccessProfileCapability" ADD CONSTRAINT "AccessProfileCapability_accessProfileId_fkey" FOREIGN KEY ("accessProfileId") REFERENCES "AccessProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PositionAccessAssignment" ADD CONSTRAINT "PositionAccessAssignment_positionProfileId_fkey" FOREIGN KEY ("positionProfileId") REFERENCES "PositionProfile"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PositionAccessAssignment" ADD CONSTRAINT "PositionAccessAssignment_accessProfileId_fkey" FOREIGN KEY ("accessProfileId") REFERENCES "AccessProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PositionAccessAssignment" ADD CONSTRAINT "PositionAccessAssignment_customNodeId_fkey" FOREIGN KEY ("customNodeId") REFERENCES "OrgNode"("id") ON DELETE SET NULL ON UPDATE CASCADE;

