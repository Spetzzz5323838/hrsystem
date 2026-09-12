import { Bot, Keyboard } from "grammy";
import { prisma } from "../lib/prisma";
import { resolveAssignee } from "../lib/onboarding";
import { sendTelegramMessage } from "../lib/telegram";
import { Prisma, Role } from "../generated/prisma/client";

const token = process.env.TELEGRAM_BOT_TOKEN;
if (!token) {
  throw new Error("TELEGRAM_BOT_TOKEN не заданий у .env");
}

const bot = new Bot(token);

// ── Реєстрація по QR (docs catalogs-v1.1 §6.1, п.1) ──
// QR/deep-link кодує об'єкт (OrgNode), не штатну одиницю: посаду
// призначає адміністратор потім, обираючи StaffUnit (docs п.3). До
// призначення посади заявка живе як PendingHire, не Employment —
// Employment.staffUnitId в моделі обов'язковий.
type RegistrationStep = "fullName" | "birthDate" | "email" | "phone";

type RegistrationState = {
  step: RegistrationStep;
  orgNodeId: number;
  orgNodeName: string;
  orgNodePath: string;
  fullName?: string;
  birthDate?: Date;
  email?: string | null;
};

const registrations = new Map<number, RegistrationState>();

function normalizePhone(raw: string): string {
  const trimmed = raw.trim();
  return trimmed.startsWith("+") ? trimmed : `+${trimmed}`;
}

function isValidFullName(text: string): boolean {
  const trimmed = text.trim();
  if (trimmed.split(/\s+/).length < 2) return false;
  return /^[А-ЯҐЄІЇа-яґєіїA-Za-z'’\-\s]{5,80}$/.test(trimmed);
}

function parseBirthDate(text: string): Date | null {
  const match = text.trim().match(/^(\d{2})\.(\d{2})\.(\d{4})$/);
  if (!match) return null;
  const [, dd, mm, yyyy] = match;
  const date = new Date(Number(yyyy), Number(mm) - 1, Number(dd));
  if (date.getFullYear() !== Number(yyyy) || date.getMonth() !== Number(mm) - 1 || date.getDate() !== Number(dd)) {
    return null;
  }
  const ageYears = (Date.now() - date.getTime()) / (1000 * 60 * 60 * 24 * 365.25);
  if (ageYears < 14 || ageYears > 100) return null;
  return date;
}

function isValidEmail(text: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(text.trim());
}

bot.command("start", async (ctx) => {
  if (!ctx.from) return;
  const payload = ctx.match?.toString().trim();

  if (!payload) {
    await ctx.reply("Вітаю! Це бот системи управління персоналом мережі «Коровай». Щоб зареєструватись, відскануйте QR-код на вашому об'єкті.");
    return;
  }

  const orgNodeId = Number(payload);
  if (!Number.isInteger(orgNodeId)) {
    await ctx.reply("Невірне посилання для реєстрації. Зверніться до адміністратора об'єкта.");
    return;
  }

  const orgNode = await prisma.orgNode.findUnique({ where: { id: orgNodeId } });
  if (!orgNode) {
    await ctx.reply("Об'єкт не знайдено. Зверніться до адміністратора.");
    return;
  }

  const existing = await prisma.pendingHire.findUnique({ where: { telegramId: BigInt(ctx.from.id) } });
  if (existing) {
    await ctx.reply("Ви вже подали заявку на реєстрацію. Очікуйте, поки адміністратор об'єкта заповнить ваш профіль.");
    return;
  }

  registrations.set(ctx.from.id, {
    step: "fullName",
    orgNodeId,
    orgNodeName: orgNode.name,
    orgNodePath: orgNode.path,
  });

  await ctx.reply(`Реєстрація на об'єкт «${orgNode.name}».\n\nВведіть, будь ласка, ваше повне ім'я (прізвище, ім'я, по батькові).`);
});

bot.on("message:text", async (ctx) => {
  const state = registrations.get(ctx.from.id);
  if (!state) return;

  if (state.step === "fullName") {
    const text = ctx.message.text.trim();
    if (!isValidFullName(text)) {
      await ctx.reply("Не схоже на ПІБ. Введіть прізвище, ім'я та по батькові одним повідомленням.");
      return;
    }
    state.fullName = text;
    state.step = "birthDate";
    await ctx.reply("Дякую. Тепер введіть дату народження у форматі ДД.ММ.РРРР (наприклад, 15.03.1998).");
    return;
  }

  if (state.step === "birthDate") {
    const birthDate = parseBirthDate(ctx.message.text);
    if (!birthDate) {
      await ctx.reply("Не вдалося розпізнати дату. Формат: ДД.ММ.РРРР, наприклад 15.03.1998.");
      return;
    }
    state.birthDate = birthDate;
    state.step = "email";
    await ctx.reply("Ваша електронна пошта? Якщо немає — напишіть «немає».");
    return;
  }

  if (state.step === "email") {
    const text = ctx.message.text.trim();
    if (text.toLowerCase() !== "немає") {
      if (!isValidEmail(text)) {
        await ctx.reply("Не схоже на е-пошту. Введіть коректну адресу або напишіть «немає».");
        return;
      }
      state.email = text;
    } else {
      state.email = null;
    }
    state.step = "phone";
    await ctx.reply("Останній крок — поділіться номером телефону кнопкою нижче.", {
      reply_markup: new Keyboard().requestContact("Поділитися номером телефону").resized().oneTime(),
    });
    return;
  }
});

bot.on("message:contact", async (ctx) => {
  const state = registrations.get(ctx.from.id);
  if (!state || state.step !== "phone") return;

  if (ctx.message.contact.user_id !== ctx.from.id) {
    await ctx.reply("Поділіться, будь ласка, власним контактом (кнопкою нижче), а не чужим.");
    return;
  }
  if (!state.fullName || !state.birthDate) return;

  const phone = normalizePhone(ctx.message.contact.phone_number);

  try {
    await prisma.pendingHire.create({
      data: {
        fullName: state.fullName,
        birthDate: state.birthDate,
        phone,
        email: state.email ?? null,
        telegramId: BigInt(ctx.from.id),
        orgNodeId: state.orgNodeId,
      },
    });

    await ctx.reply(
      `Дякую, ${state.fullName}! Вашу заявку зареєстровано на об'єкт «${state.orgNodeName}». ` +
        "Адміністратор об'єкта заповнить ваш профіль і активує вас — очікуйте на подальші кроки.",
      { reply_markup: { remove_keyboard: true } },
    );

    const adminEmploymentId = await resolveAssignee(Role.STORE_ADMIN, state.orgNodePath);
    if (adminEmploymentId) {
      const adminEmployment = await prisma.employment.findUnique({ where: { id: adminEmploymentId }, include: { person: true } });
      if (adminEmployment?.person.telegramId) {
        await sendTelegramMessage(
          adminEmployment.person.telegramId,
          `Нова заявка на реєстрацію: ${state.fullName} (${state.orgNodeName}). Перевірте розділ «Нові заявки» в системі.`,
        );
      }
    }
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      await ctx.reply("Цей номер телефону вже використовується в системі. Зверніться до адміністратора об'єкта.", {
        reply_markup: { remove_keyboard: true },
      });
    } else {
      console.error("Registration error:", error);
      await ctx.reply("Сталася помилка під час реєстрації. Спробуйте ще раз пізніше або зверніться до адміністратора.", {
        reply_markup: { remove_keyboard: true },
      });
    }
  } finally {
    registrations.delete(ctx.from.id);
  }
});

bot.catch((err) => {
  console.error("Bot error:", err);
});

process.once("SIGINT", () => bot.stop());
process.once("SIGTERM", () => bot.stop());

bot.start();
console.log("Бот запущено (long polling).");
