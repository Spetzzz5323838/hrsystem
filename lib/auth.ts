import argon2 from "argon2";
import { createHash, randomBytes, randomInt } from "node:crypto";
import { cookies } from "next/headers";
import { prisma } from "./prisma";

const SESSION_COOKIE_NAME = "hr_session";
const SESSION_TTL_MS = 12 * 60 * 60 * 1000; // 12 год — docs/hr-system-plan-v1.md §4.4

export async function hashPassword(password: string): Promise<string> {
  return argon2.hash(password, { type: argon2.argon2id });
}

/** Пароль для входу в кабінет, який працівник отримує через бота при активації — 8 цифр, легко ввести з телефону. */
export function generateCabinetPassword(): string {
  return randomInt(10_000_000, 100_000_000).toString();
}

export async function verifyPassword(hash: string, password: string): Promise<boolean> {
  return argon2.verify(hash, password);
}

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/** Створює сесію в базі й ставить httpOnly-cookie з сирим токеном. */
export async function createSession(personId: number) {
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);

  await prisma.session.create({
    data: { personId, tokenHash: hashToken(token), expiresAt },
  });

  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/",
    expires: expiresAt,
  });
}

/** Читає cookie поточного запиту й повертає залогованого Person або null. */
export async function getSessionPerson() {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE_NAME)?.value;
  if (!token) return null;

  const session = await prisma.session.findUnique({
    where: { tokenHash: hashToken(token) },
    include: { person: true },
  });

  if (!session || session.expiresAt < new Date()) return null;
  return session.person;
}

/** Знищує поточну сесію в базі й видаляє cookie. */
export async function destroySession() {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE_NAME)?.value;
  if (token) {
    await prisma.session.deleteMany({ where: { tokenHash: hashToken(token) } });
  }
  cookieStore.delete(SESSION_COOKIE_NAME);
}
