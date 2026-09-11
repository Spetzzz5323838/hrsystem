-- AlterTable
ALTER TABLE "Employment" ADD COLUMN     "curatorId" INTEGER;

-- AddForeignKey
ALTER TABLE "Employment" ADD CONSTRAINT "Employment_curatorId_fkey" FOREIGN KEY ("curatorId") REFERENCES "Employment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

