import { PgBoss } from "pg-boss";

// Черга поверх тієї ж PostgreSQL, без Redis (докс). Один інстанс на
// процес — і веб (щоб класти джоби), і бот (щоб їх забирати) підключаються
// до тієї самої черги, кожен зі своїм PgBoss-клієнтом.
const globalForBoss = globalThis as unknown as {
  boss: PgBoss | undefined;
  bossStarting: Promise<PgBoss> | undefined;
};

async function createBoss(): Promise<PgBoss> {
  const boss = new PgBoss(process.env.DATABASE_URL!);
  boss.on("error", (err) => console.error("pg-boss error:", err));
  await boss.start();
  return boss;
}

export async function getBoss(): Promise<PgBoss> {
  if (globalForBoss.boss) return globalForBoss.boss;
  if (!globalForBoss.bossStarting) {
    globalForBoss.bossStarting = createBoss().then((boss) => {
      globalForBoss.boss = boss;
      return boss;
    });
  }
  return globalForBoss.bossStarting;
}
