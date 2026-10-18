# Розгортання на бойовому сервері

Windows Server 2019, без Docker. Два процеси під PM2: сайт (`hr-web`, порт 3010) і Telegram-бот (`hr-bot`). База — PostgreSQL 16.

Перевірено 2026-10-18: збірка `next build` проходить, усі міграції накочуються на порожню базу, бойовий seed створює довідники й одного адміністратора.

## Один раз, при першому розгортанні

1. **Встановити:** Node.js (LTS, не нижче 20), PostgreSQL 16, Git, PM2 (`npm install -g pm2`).
2. **База:** створити користувача `hruser` і базу `hrsystem`. Якщо міграція скаржиться на доступ до схеми `public`, у базі `hrsystem` виконати `GRANT ALL ON SCHEMA public TO hruser;`.
3. **Код:** `git clone https://github.com/Spetzzz5323838/hrsystem.git`, перейти в папку проєкту.
4. **Файл `.env`:** скопіювати `.env.example` у `.env` і заповнити:
   - `DATABASE_URL` — адреса бойової бази;
   - `TELEGRAM_BOT_TOKEN`, `TELEGRAM_BOT_USERNAME` — **окремий бойовий бот** (з тим самим токеном не можна одночасно запускати бота на комп'ютері розробника);
   - `COOKIE_SECURE="false"` — поки сайт відкривається по http (без цього вхід не працюватиме);
   - `SEED_MODE="production"` та `INITIAL_ADMIN_PHONE`, `INITIAL_ADMIN_NAME`, `INITIAL_ADMIN_PASSWORD` (від 10 символів) — перший системний адміністратор. Тестових користувачів із паролем `Test1234!` у цьому режимі **не створюється**.
5. **Встановлення й збірка:**
   ```
   npm ci
   npx dotenv -e .env -- npx prisma generate
   npx dotenv -e .env -- npx prisma migrate deploy
   npx dotenv -e .env -- npx prisma db seed
   npm run build
   ```
   Усі команди `prisma` запускаються саме з `npx dotenv -e .env --`: без цього вони не бачать `DATABASE_URL`.
6. **Запуск:** `pm2 start ecosystem.config.cjs`, потім `pm2 save`. Автозапуск після перезавантаження сервера на Windows — через `pm2-windows-startup` або планувальник завдань (команда `pm2 resurrect`).
7. **Перший вхід:** відкрити `http://<адреса сервера>:3010`, увійти під `INITIAL_ADMIN_*`, прив'язати Telegram, змінити назви об'єктів у «Структурі» (там заглушки «Магазин SH02»…), створити реальних керівників і працівників.
8. Після першого наповнення **закоментувати `SEED_MODE` та `INITIAL_ADMIN_*` у `.env`**.

## Оновлення до нової версії

```
git pull
npm ci
npx dotenv -e .env -- npx prisma generate
npx dotenv -e .env -- npx prisma migrate deploy
npm run build
pm2 restart all
```

Після зміни схеми бази обов'язково перезапускати **обидва** процеси (`pm2 restart all`), інакше бот працюватиме зі старим кодом.

## Що резервувати

- база PostgreSQL (`pg_dump`);
- папка `storage/` у корені проєкту (документи, матеріали, фото обходів) — вона не в Git;
- файл `.env`.

## Чого не робити

- Не запускати `prisma db seed` без `SEED_MODE=production` на бойовій базі: він додасть тестових людей.
- Не виставляти порт 3010 в інтернет: система розрахована на локальну мережу (VPN між підрозділами).
