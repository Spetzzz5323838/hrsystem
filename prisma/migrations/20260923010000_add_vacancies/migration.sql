-- CreateEnum
CREATE TYPE "VacancyReason" AS ENUM ('TERMINATION', 'NEW_POSITION', 'HEADCOUNT_INCREASE');

-- CreateEnum
CREATE TYPE "VacancyStatus" AS ENUM ('OPEN', 'POSTED', 'CLOSED');

-- AlterEnum
ALTER TYPE "Capability" ADD VALUE 'MANAGE_VACANCIES';

-- CreateTable
CREATE TABLE "Vacancy" (
    "id" SERIAL NOT NULL,
    "staffUnitId" INTEGER NOT NULL,
    "reason" "VacancyReason" NOT NULL,
    "status" "VacancyStatus" NOT NULL DEFAULT 'OPEN',
    "note" TEXT,
    "createdById" INTEGER,
    "closedById" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "postedAt" TIMESTAMP(3),
    "closedAt" TIMESTAMP(3),

    CONSTRAINT "Vacancy_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Vacancy_staffUnitId_idx" ON "Vacancy"("staffUnitId");

-- AddForeignKey
ALTER TABLE "Vacancy" ADD CONSTRAINT "Vacancy_staffUnitId_fkey" FOREIGN KEY ("staffUnitId") REFERENCES "StaffUnit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Vacancy" ADD CONSTRAINT "Vacancy_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "Employment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Vacancy" ADD CONSTRAINT "Vacancy_closedById_fkey" FOREIGN KEY ("closedById") REFERENCES "Employment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

