-- AlterTable
ALTER TABLE "Task" ADD COLUMN     "escalatedAt" TIMESTAMP(3),
ADD COLUMN     "overdueNotifiedAt" TIMESTAMP(3);

