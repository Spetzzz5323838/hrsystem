-- CreateEnum
CREATE TYPE "RatingType" AS ENUM ('POSITIVE', 'NEGATIVE', 'REPRIMAND', 'AWARD', 'AUTO');

-- CreateEnum
CREATE TYPE "RatingSide" AS ENUM ('POS', 'NEG');

-- CreateEnum
CREATE TYPE "Visibility" AS ENUM ('PRIVATE', 'EMPLOYEE', 'PUBLIC');

-- CreateTable
CREATE TABLE "RatingCategory" (
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "side" "RatingSide" NOT NULL,
    "defaultPoints" INTEGER NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "RatingCategory_pkey" PRIMARY KEY ("code")
);

-- CreateTable
CREATE TABLE "RatingEvent" (
    "id" SERIAL NOT NULL,
    "personId" INTEGER NOT NULL,
    "type" "RatingType" NOT NULL,
    "categoryCode" TEXT,
    "points" INTEGER NOT NULL,
    "comment" TEXT,
    "visibility" "Visibility" NOT NULL,
    "authorId" INTEGER NOT NULL,
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "cancelledAt" TIMESTAMP(3),
    "cancelReason" TEXT,

    CONSTRAINT "RatingEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Badge" (
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "isAuto" BOOLEAN NOT NULL,
    "ruleJson" JSONB,

    CONSTRAINT "Badge_pkey" PRIMARY KEY ("code")
);

-- CreateTable
CREATE TABLE "BadgeAward" (
    "id" SERIAL NOT NULL,
    "personId" INTEGER NOT NULL,
    "badgeCode" TEXT NOT NULL,
    "awardedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "awardedById" INTEGER,
    "comment" TEXT,

    CONSTRAINT "BadgeAward_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "RatingEvent_personId_idx" ON "RatingEvent"("personId");

-- CreateIndex
CREATE INDEX "RatingEvent_authorId_idx" ON "RatingEvent"("authorId");

-- CreateIndex
CREATE INDEX "BadgeAward_personId_idx" ON "BadgeAward"("personId");

-- AddForeignKey
ALTER TABLE "RatingEvent" ADD CONSTRAINT "RatingEvent_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RatingEvent" ADD CONSTRAINT "RatingEvent_categoryCode_fkey" FOREIGN KEY ("categoryCode") REFERENCES "RatingCategory"("code") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RatingEvent" ADD CONSTRAINT "RatingEvent_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "Employment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BadgeAward" ADD CONSTRAINT "BadgeAward_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BadgeAward" ADD CONSTRAINT "BadgeAward_badgeCode_fkey" FOREIGN KEY ("badgeCode") REFERENCES "Badge"("code") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BadgeAward" ADD CONSTRAINT "BadgeAward_awardedById_fkey" FOREIGN KEY ("awardedById") REFERENCES "Employment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

