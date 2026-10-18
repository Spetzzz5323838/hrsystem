-- AlterTable: пароль 1С → пароль до каси (перейменування, не видалення)
ALTER TABLE "Employment" RENAME COLUMN "onecPasswordCipher" TO "posPasswordCipher";
ALTER TABLE "Employment" RENAME COLUMN "onecPasswordSetAt" TO "posPasswordSetAt";

-- AlterTable: код працівника для бейджа й обліку робочого часу
ALTER TABLE "Person" ADD COLUMN "badgeCode" TEXT,
ADD COLUMN "badgeCodeIssuedAt" TIMESTAMP(3);

-- CreateIndex
CREATE UNIQUE INDEX "Person_badgeCode_key" ON "Person"("badgeCode");
