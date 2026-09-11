-- CreateEnum
CREATE TYPE "OrgNodeType" AS ENUM ('COMPANY', 'DIVISION', 'OBJECT', 'DEPARTMENT');

-- CreateEnum
CREATE TYPE "Role" AS ENUM ('EMPLOYEE', 'CURATOR', 'STORE_ADMIN', 'ONEC_ADMIN', 'ACCOUNTANT', 'AUDITOR', 'COO', 'SYSADMIN');

-- CreateEnum
CREATE TYPE "ScopeType" AS ENUM ('SELF', 'SUBORDINATES', 'OWN_DEPARTMENT', 'OWN_OBJECT', 'OWN_SUBTREE', 'CUSTOM_NODE', 'COMPANY');

-- CreateEnum
CREATE TYPE "Capability" AS ENUM ('VIEW_EMPLOYEE', 'EDIT_PROFILE', 'ACTIVATE_EMPLOYEE', 'ASSIGN_CURATOR', 'VIEW_DOCUMENTS', 'UPLOAD_DOCUMENTS', 'SET_1C_PASSWORD', 'CLOSE_INTERNSHIP', 'RUN_ATTESTATION', 'RATE_POSITIVE_NEGATIVE', 'ISSUE_REPRIMAND_AWARD', 'ASSIGN_EQUIPMENT', 'CLEAR_EQUIPMENT', 'INIT_TERMINATION', 'APPROVE_TERMINATION', 'CLOSE_TERMINATION', 'PRINT_CLEARANCE', 'MANAGE_MATERIALS', 'MANAGE_TEMPLATES', 'MANAGE_ORG_STRUCTURE', 'VIEW_ANALYTICS', 'VIEW_AUDIT_LOG', 'MANAGE_REMINDERS');

-- CreateEnum
CREATE TYPE "EmploymentStatus" AS ENUM ('REGISTERED', 'ACTIVATED', 'DOCUMENTS_PENDING', 'TRAINEE', 'READY_FOR_ATTESTATION', 'ACTIVE', 'TERMINATION_STARTED', 'TERMINATED');

-- CreateTable
CREATE TABLE "OrgNode" (
    "id" SERIAL NOT NULL,
    "type" "OrgNodeType" NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT,
    "parentId" INTEGER,
    "path" TEXT NOT NULL,
    "headEmploymentId" INTEGER,
    "address" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "externalRef" TEXT,

    CONSTRAINT "OrgNode_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Person" (
    "id" SERIAL NOT NULL,
    "fullName" TEXT NOT NULL,
    "birthDate" TIMESTAMP(3),
    "telegramId" BIGINT,
    "phone" TEXT,
    "externalRef" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Person_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Employment" (
    "id" SERIAL NOT NULL,
    "personId" INTEGER NOT NULL,
    "staffUnitId" INTEGER NOT NULL,
    "status" "EmploymentStatus" NOT NULL DEFAULT 'REGISTERED',
    "hiredAt" TIMESTAMP(3),
    "terminatedAt" TIMESTAMP(3),
    "rate" DECIMAL(3,2),
    "managerId" INTEGER,

    CONSTRAINT "Employment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PositionProfile" (
    "id" SERIAL NOT NULL,
    "title" TEXT NOT NULL,
    "level" INTEGER NOT NULL,
    "canBeCurator" BOOLEAN NOT NULL DEFAULT false,
    "requiresCashierAccount" BOOLEAN NOT NULL DEFAULT false,
    "isFoodHandling" BOOLEAN NOT NULL DEFAULT false,
    "isMateriallyLiable" BOOLEAN NOT NULL DEFAULT false,
    "systemRole" "Role",
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "externalRef" TEXT,

    CONSTRAINT "PositionProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StaffUnit" (
    "id" SERIAL NOT NULL,
    "positionProfileId" INTEGER NOT NULL,
    "orgNodeId" INTEGER NOT NULL,
    "plannedHeadcount" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "StaffUnit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PermissionGrant" (
    "id" SERIAL NOT NULL,
    "positionProfileId" INTEGER,
    "role" "Role",
    "capability" "Capability" NOT NULL,
    "scope" "ScopeType" NOT NULL,
    "customNodeId" INTEGER,

    CONSTRAINT "PermissionGrant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RoleAssignment" (
    "id" SERIAL NOT NULL,
    "employmentId" INTEGER NOT NULL,
    "role" "Role" NOT NULL,
    "orgNodeId" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdById" INTEGER,

    CONSTRAINT "RoleAssignment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "OrgNode_code_key" ON "OrgNode"("code");

-- CreateIndex
CREATE INDEX "OrgNode_path_idx" ON "OrgNode"("path");

-- CreateIndex
CREATE UNIQUE INDEX "Person_telegramId_key" ON "Person"("telegramId");

-- CreateIndex
CREATE UNIQUE INDEX "Person_phone_key" ON "Person"("phone");

-- CreateIndex
CREATE INDEX "Employment_personId_idx" ON "Employment"("personId");

-- CreateIndex
CREATE INDEX "Employment_staffUnitId_idx" ON "Employment"("staffUnitId");

-- CreateIndex
CREATE UNIQUE INDEX "StaffUnit_positionProfileId_orgNodeId_key" ON "StaffUnit"("positionProfileId", "orgNodeId");

-- CreateIndex
CREATE INDEX "PermissionGrant_positionProfileId_idx" ON "PermissionGrant"("positionProfileId");

-- CreateIndex
CREATE INDEX "PermissionGrant_role_idx" ON "PermissionGrant"("role");

-- CreateIndex
CREATE UNIQUE INDEX "RoleAssignment_employmentId_role_orgNodeId_key" ON "RoleAssignment"("employmentId", "role", "orgNodeId");

-- AddForeignKey
ALTER TABLE "OrgNode" ADD CONSTRAINT "OrgNode_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "OrgNode"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrgNode" ADD CONSTRAINT "OrgNode_headEmploymentId_fkey" FOREIGN KEY ("headEmploymentId") REFERENCES "Employment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Employment" ADD CONSTRAINT "Employment_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Employment" ADD CONSTRAINT "Employment_staffUnitId_fkey" FOREIGN KEY ("staffUnitId") REFERENCES "StaffUnit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Employment" ADD CONSTRAINT "Employment_managerId_fkey" FOREIGN KEY ("managerId") REFERENCES "Employment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StaffUnit" ADD CONSTRAINT "StaffUnit_positionProfileId_fkey" FOREIGN KEY ("positionProfileId") REFERENCES "PositionProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StaffUnit" ADD CONSTRAINT "StaffUnit_orgNodeId_fkey" FOREIGN KEY ("orgNodeId") REFERENCES "OrgNode"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PermissionGrant" ADD CONSTRAINT "PermissionGrant_positionProfileId_fkey" FOREIGN KEY ("positionProfileId") REFERENCES "PositionProfile"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PermissionGrant" ADD CONSTRAINT "PermissionGrant_customNodeId_fkey" FOREIGN KEY ("customNodeId") REFERENCES "OrgNode"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RoleAssignment" ADD CONSTRAINT "RoleAssignment_employmentId_fkey" FOREIGN KEY ("employmentId") REFERENCES "Employment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RoleAssignment" ADD CONSTRAINT "RoleAssignment_orgNodeId_fkey" FOREIGN KEY ("orgNodeId") REFERENCES "OrgNode"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
