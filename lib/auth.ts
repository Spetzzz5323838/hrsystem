import argon2 from "argon2";
import { createHash, randomBytes, randomInt } from "node:crypto";
import { cookies } from "next/headers";
import { prisma } from "./prisma";
import { EmploymentStatus, LoginChallengeStatus, Role } from "../generated/prisma/client";

const SESSION_COOKIE_NAME = "hr_session";
const SESSION_TTL_MS = 12 * 60 * 60 * 1000; // 12 год — docs/hr-system-plan-v1.md §4.4

const TRUSTED_DEVICE_COOKIE_NAME = "hr_trusted_device";
const TRUSTED_DEVICE_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 днів — docs/hr-system-plan-v1.md §4.4
const LOGIN_CHALLENGE_TTL_MS = 5 * 60 * 1000;

/** Ролі з обов'язковим 2FA (docs plan-v1.md §4.4) — узгоджено з користувачем: без винятків per-людина. */
const TWO_FACTOR_ROLES: Role[] = [Role.ONEC_ADMIN, Role.ACCOUNTANT, Role.COO, Role.SYSADMIN];

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

/** Чи має людина активну роль, що вимагає 2FA (docs §4.4) — незалежно від вузла. */
export async function requiresTwoFactor(personId: number): Promise<boolean> {
  const count = await prisma.roleAssignment.count({
    where: {
      role: { in: TWO_FACTOR_ROLES },
      employment: { personId, status: { not: EmploymentStatus.TERMINATED } },
    },
  });
  return count > 0;
}

/** Чи довіряє система цьому браузеру для цієї людини (docs: "довірений пристрій" 30 днів). */
export async function hasTrustedDevice(personId: number): Promise<boolean> {
  const cookieStore = await cookies();
  const token = cookieStore.get(TRUSTED_DEVICE_COOKIE_NAME)?.value;
  if (!token) return false;

  const device = await prisma.trustedDevice.findUnique({ where: { tokenHash: hashToken(token) } });
  return !!device && device.personId === personId && device.expiresAt > new Date();
}

/** Ставить новий "довірений пристрій"-cookie після успішного 2FA. */
export async function markTrustedDevice(personId: number): Promise<void> {
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + TRUSTED_DEVICE_TTL_MS);

  await prisma.trustedDevice.create({ data: { personId, tokenHash: hashToken(token), expiresAt } });

  const cookieStore = await cookies();
  cookieStore.set(TRUSTED_DEVICE_COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/",
    expires: expiresAt,
  });
}

/** Створює виклик 2FA (кнопка в Telegram), TTL 5 хв. */
export async function createLoginChallenge(personId: number): Promise<number> {
  const challenge = await prisma.loginChallenge.create({
    data: { personId, expiresAt: new Date(Date.now() + LOGIN_CHALLENGE_TTL_MS) },
  });
  return challenge.id;
}

export type LoginChallengeState = "PENDING" | "APPROVED" | "EXPIRED" | "NOT_FOUND";

/** Читає стан виклику, автоматично "гасить" протермінований PENDING у EXPIRED. */
export async function getLoginChallengeState(id: number): Promise<LoginChallengeState> {
  const challenge = await prisma.loginChallenge.findUnique({ where: { id } });
  if (!challenge) return "NOT_FOUND";

  if (challenge.status === LoginChallengeStatus.PENDING && challenge.expiresAt < new Date()) {
    await prisma.loginChallenge.update({ where: { id }, data: { status: LoginChallengeStatus.EXPIRED } });
    return "EXPIRED";
  }
  return challenge.status;
}

/** Викликає бот (login_confirm) — звіряє telegramId з людиною виклику, той самий принцип, що й ready_for_attestation/review_ack. */
export async function approveLoginChallenge(id: number, telegramId: bigint): Promise<{ ok: true } | { ok: false; error: string }> {
  const challenge = await prisma.loginChallenge.findUnique({ where: { id }, include: { person: true } });
  if (!challenge) return { ok: false, error: "Запит не знайдено" };
  if (challenge.person.telegramId !== telegramId) return { ok: false, error: "Це не ваш запит на вхід" };

  const state = await getLoginChallengeState(id);
  if (state !== "PENDING") return { ok: false, error: "Запит уже неактуальний, спробуйте увійти знову" };

  await prisma.loginChallenge.update({ where: { id }, data: { status: LoginChallengeStatus.APPROVED, approvedAt: new Date() } });
  return { ok: true };
}

/**
 * Викликає polling-ендпоінт логіну. Атомарний "спожив" через умовний
 * updateMany (consumedAt IS NULL) — захист від подвійного створення сесії,
 * якщо клієнт встиг опитати статус двічі одночасно.
 */
export async function consumeLoginChallenge(id: number): Promise<{ ok: true; personId: number } | { ok: false }> {
  const challenge = await prisma.loginChallenge.findUnique({ where: { id } });
  if (!challenge || challenge.status !== LoginChallengeStatus.APPROVED) return { ok: false };

  const result = await prisma.loginChallenge.updateMany({
    where: { id, status: LoginChallengeStatus.APPROVED, consumedAt: null },
    data: { consumedAt: new Date() },
  });
  if (result.count === 0) return { ok: false };

  return { ok: true, personId: challenge.personId };
}
