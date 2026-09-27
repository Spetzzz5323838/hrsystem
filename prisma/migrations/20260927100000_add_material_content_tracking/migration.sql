-- AlterTable
ALTER TABLE "Material" ADD COLUMN     "contentUpdatedAt" TIMESTAMP(3),
ADD COLUMN     "contentUpdatedById" INTEGER;

-- AddForeignKey
ALTER TABLE "Material" ADD CONSTRAINT "Material_contentUpdatedById_fkey" FOREIGN KEY ("contentUpdatedById") REFERENCES "Employment"("id") ON DELETE SET NULL ON UPDATE CASCADE;
