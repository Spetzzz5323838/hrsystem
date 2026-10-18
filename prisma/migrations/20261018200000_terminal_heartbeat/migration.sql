-- Етап 4: сигнал "термінал живий" і алерт про мовчання
ALTER TABLE "Terminal" ADD COLUMN     "lastPendingCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "silenceAlertedAt" TIMESTAMP(3);
