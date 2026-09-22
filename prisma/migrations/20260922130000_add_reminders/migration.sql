-- CreateTable
CREATE TABLE "Reminder" (
    "id" SERIAL NOT NULL,
    "employmentId" INTEGER NOT NULL,
    "authorId" INTEGER NOT NULL,
    "text" TEXT NOT NULL,
    "dueAt" TIMESTAMP(3),
    "isDone" BOOLEAN NOT NULL DEFAULT false,
    "doneAt" TIMESTAMP(3),
    "notifiedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Reminder_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Reminder_authorId_idx" ON "Reminder"("authorId");

-- CreateIndex
CREATE INDEX "Reminder_employmentId_idx" ON "Reminder"("employmentId");

-- AddForeignKey
ALTER TABLE "Reminder" ADD CONSTRAINT "Reminder_employmentId_fkey" FOREIGN KEY ("employmentId") REFERENCES "Employment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Reminder" ADD CONSTRAINT "Reminder_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "Employment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

