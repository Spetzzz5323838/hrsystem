-- Окремого пароля до каси немає: на касі вводиться код бейджа (2026-10-18)
ALTER TABLE "Employment" DROP COLUMN "posPasswordCipher",
DROP COLUMN "posPasswordSetAt";
