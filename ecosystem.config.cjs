// PM2 на бойовому сервері (Windows Server 2019, без Docker): два процеси — сайт і Telegram-бот.
// Змінні беруться з .env у корені проєкту (той самий файл, що й у розробці), тож нічого не дублюється.
// Запуск: pm2 start ecosystem.config.cjs   |   перезапуск після оновлення: pm2 restart all
const fs = require("node:fs");
const path = require("node:path");

function loadEnv() {
  const env = {};
  const file = path.join(__dirname, ".env");
  if (!fs.existsSync(file)) return env;
  for (const line of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    const m = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/.exec(line);
    if (!m || line.trim().startsWith("#")) continue;
    env[m[1]] = m[2].replace(/^"(.*)"$/, "$1").replace(/^'(.*)'$/, "$1");
  }
  return env;
}

const env = { ...loadEnv(), NODE_ENV: "production" };

module.exports = {
  apps: [
    {
      name: "hr-web",
      script: "node_modules/next/dist/bin/next",
      args: "start -p 3010",
      cwd: __dirname,
      env,
      max_restarts: 10,
      restart_delay: 3000,
    },
    {
      name: "hr-bot",
      script: "node_modules/tsx/dist/cli.mjs",
      args: "bot/index.ts",
      cwd: __dirname,
      env,
      max_restarts: 10,
      restart_delay: 3000,
    },
  ],
};
