import { Bot, Keyboard } from "grammy";
import { prisma } from "../lib/prisma";
import { resolveAssignee, confirmReadyForAttestation, completeTask, getMyPendingEmployeeMarkTasks } from "../lib/onboarding";
import { registerTelegramMessageWorker } from "../lib/notifications";
import { sendNotification, sendNotificationNow } from "../lib/notificationTemplates";
import { getBoss } from "../lib/queue";
import { checkSlaEscalations } from "../lib/sla";
import { runPeriodicBadgeChecks } from "../lib/badges-periodic";
import { cleanupExpiredDocuments } from "../lib/document-retention";
import { checkDueReminders } from "../lib/reminders";
import { acknowledgeReview } from "../lib/review";
import { approveLoginChallenge, resetCabinetPassword } from "../lib/auth";
import { checkVacationConflicts, createVacationRequest, type ConflictCheck } from "../lib/vacation";
import { deliverOnecPassword } from "../lib/onecPassword";
import { ONEC_PASSWORD_DELIVERY_QUEUE } from "../lib/notifications";
import { EmploymentStatus, Prisma, Role, VacationType } from "../generated/prisma/client";

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

// ── /link: прив'язка Telegram до вже наявного акаунта (докс: адміни й
// куратори, заведені до появи бота, не мають telegramId — без нього
// сповіщення (заявка адміну, підопічний куратору) фізично нікуди слати).
// Прив'язка теж через "поділитися контактом" (не текстом), щоб не можна
// було ввести чужий номер — той самий принцип, що й у реєстрації.
const linkRequests = new Set<number>();

// ── /vacation: самоподача заявки на відпустку (docs v1.2 §4.1) —
// архітектурне рішення №1: лінійний персонал працює тільки через бот, тому
// цей крок дублює те, що адміністратор уже може зробити за працівника у
// вебі (вкладка "Відпустки" на картці), тим самим типом заявки й тими ж
// перевірками конфліктів (lib/vacation.ts — спільний код, не дублюється).
type VacationStep = "type" | "from" | "to" | "confirm";

type VacationState = {
  step: VacationStep;
  employmentId: number;
  type?: VacationType;
  fromDate?: Date;
  toDate?: Date;
  conflict?: ConflictCheck;
};

const vacationSessions = new Map<number, VacationState>();

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

/** ДД.ММ.РРРР без вікових обмежень parseBirthDate — для дат відпустки. */
function parseDateDMY(text: string): Date | null {
  const match = text.trim().match(/^(\d{2})\.(\d{2})\.(\d{4})$/);
  if (!match) return null;
  const [, dd, mm, yyyy] = match;
  const date = new Date(Number(yyyy), Number(mm) - 1, Number(dd));
  if (date.getFullYear() !== Number(yyyy) || date.getMonth() !== Number(mm) - 1 || date.getDate() !== Number(dd)) {
    return null;
  }
  return date;
}

bot.command("start", async (ctx) => {
  if (!ctx.from) return;
  const payload = ctx.match?.toString().trim();

  if (!payload) {
    await ctx.reply(
      "Вітаю! Це бот системи управління персоналом мережі «Коровай». Щоб зареєструватись, відскануйте QR-код на вашому об'єкті.\n\n" +
        "Якщо ви вже працюєте в компанії й хочете отримувати сповіщення сюди — напишіть /link.\n" +
        "Щоб подати заявку на відпустку — напишіть /vacation.\n" +
        "Щоб побачити задачі, що очікують вашої дії — напишіть /tasks.\n" +
        "Щоб скинути пароль кабінету — напишіть /password.",
    );
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

bot.command("link", async (ctx) => {
  if (!ctx.from) return;

  const existing = await prisma.person.findUnique({ where: { telegramId: BigInt(ctx.from.id) } });
  if (existing) {
    await ctx.reply(`Ваш Telegram уже прив'язано до акаунта «${existing.fullName}».`);
    return;
  }

  linkRequests.add(ctx.from.id);
  await ctx.reply(
    "Щоб прив'язати Telegram до вашого акаунта в системі, поділіться номером телефону.\n\nТоркніться поля вводу тексту внизу — з'явиться кнопка «Поділитися номером телефону».",
    { reply_markup: new Keyboard().requestContact("Поділитися номером телефону").resized().oneTime() },
  );
});

bot.command("tasks", async (ctx) => {
  if (!ctx.from) return;

  const person = await prisma.person.findUnique({ where: { telegramId: BigInt(ctx.from.id) } });
  if (!person) {
    await ctx.reply("Спершу прив'яжіть Telegram до вашого акаунта — напишіть /link.");
    return;
  }

  const tasks = await getMyPendingEmployeeMarkTasks(person.id);
  if (!tasks.length) {
    await ctx.reply("Наразі немає задач, що очікують вашої дії.");
    return;
  }

  for (const t of tasks) {
    const text = t.materialsList
      ? `Матеріали для ознайомлення:\n\n${t.materialsList}\n\nПісля вивчення натисніть «Ознайомлений(а)».`
      : `Потрібна ваша дія: «${t.title}».`;
    const buttonText = t.materialsList ? "Ознайомлений(а)" : "Виконано";
    await ctx.reply(text, {
      reply_markup: { inline_keyboard: [[{ text: buttonText, callback_data: `employee_task_done:${t.taskId}` }]] },
    });
  }
});

bot.command("vacation", async (ctx) => {
  if (!ctx.from) return;

  const person = await prisma.person.findUnique({ where: { telegramId: BigInt(ctx.from.id) } });
  if (!person) {
    await ctx.reply("Спершу прив'яжіть Telegram до вашого акаунта — напишіть /link.");
    return;
  }

  const employment = await prisma.employment.findFirst({ where: { personId: person.id, status: { not: EmploymentStatus.TERMINATED } } });
  if (!employment) {
    await ctx.reply("У вас немає активного працевлаштування в системі.");
    return;
  }

  vacationSessions.set(ctx.from.id, { step: "type", employmentId: employment.id });
  await ctx.reply("Яка відпустка?\n\n1 — Щорічна\n2 — За свій рахунок\n\nВведіть 1 або 2.");
});

// ── Самообслуговування паролем кабінету (правки 20.09.2026, п.1) — поруч
// із ручним скидом адміністратором через веб (той самий lib/auth.ts::resetCabinetPassword).
bot.command("password", async (ctx) => {
  if (!ctx.from) return;

  const person = await prisma.person.findUnique({ where: { telegramId: BigInt(ctx.from.id) } });
  if (!person) {
    await ctx.reply("Спершу прив'яжіть Telegram до вашого акаунта — напишіть /link.");
    return;
  }
  if (!person.passwordHash) {
    await ctx.reply("У вас ще немає пароля кабінету — він з'явиться після активації профілю.");
    return;
  }

  await ctx.reply("Скинути пароль кабінету? Старий одразу стане недійсним.", {
    reply_markup: { inline_keyboard: [[{ text: "Так, скинути", callback_data: `password_reset_confirm:${person.id}` }]] },
  });
});

bot.on("message:text", async (ctx) => {
  const vacState = vacationSessions.get(ctx.from.id);
  if (vacState) {
    if (vacState.step === "type") {
      const text = ctx.message.text.trim();
      if (text !== "1" && text !== "2") {
        await ctx.reply("Введіть 1 (щорічна) або 2 (без збереження зарплати).");
        return;
      }
      vacState.type = text === "1" ? VacationType.ANNUAL : VacationType.UNPAID;
      vacState.step = "from";
      await ctx.reply("З якого дня? Формат: ДД.ММ.РРРР.");
      return;
    }

    if (vacState.step === "from") {
      const date = parseDateDMY(ctx.message.text);
      if (!date) {
        await ctx.reply("Не вдалося розпізнати дату. Формат: ДД.ММ.РРРР, наприклад 01.10.2026.");
        return;
      }
      vacState.fromDate = date;
      vacState.step = "to";
      await ctx.reply("По який день (включно)? Формат: ДД.ММ.РРРР.");
      return;
    }

    if (vacState.step === "to") {
      const date = parseDateDMY(ctx.message.text);
      if (!date) {
        await ctx.reply("Не вдалося розпізнати дату. Формат: ДД.ММ.РРРР, наприклад 10.10.2026.");
        return;
      }
      if (!vacState.fromDate || date < vacState.fromDate) {
        await ctx.reply("Дата закінчення раніше дати початку. Введіть ще раз дату «по».");
        return;
      }
      vacState.toDate = date;

      const conflict = await checkVacationConflicts(vacState.employmentId, vacState.fromDate, date);
      vacState.conflict = conflict;
      vacState.step = "confirm";

      const days = Math.round((date.getTime() - vacState.fromDate.getTime()) / (1000 * 60 * 60 * 24)) + 1;
      const typeLabel = vacState.type === VacationType.ANNUAL ? "Щорічна" : "За свій рахунок";
      const warning = conflict.conflictNote ? `\n\n⚠ ${conflict.conflictNote}` : "";
      await ctx.reply(
        `Перевірте заявку:\n${typeLabel}, ${ctx.message.text.trim()} — ${days} дн.${warning}\n\nНадіслати? Введіть «так» або «ні».`,
      );
      return;
    }

    if (vacState.step === "confirm") {
      const text = ctx.message.text.trim().toLowerCase();
      if (text !== "так" && text !== "ні") {
        await ctx.reply("Введіть «так» або «ні».");
        return;
      }
      if (text === "ні") {
        vacationSessions.delete(ctx.from.id);
        await ctx.reply("Заявку скасовано.");
        return;
      }

      if (!vacState.type || !vacState.fromDate || !vacState.toDate) return;
      const person = await prisma.person.findUnique({ where: { telegramId: BigInt(ctx.from.id) } });
      const createdBy = person ? await prisma.employment.findFirst({ where: { personId: person.id } }) : null;
      if (!createdBy) {
        vacationSessions.delete(ctx.from.id);
        await ctx.reply("Сталася помилка. Спробуйте ще раз /vacation.");
        return;
      }

      const result = await createVacationRequest(vacState.employmentId, { type: vacState.type, fromDate: vacState.fromDate, toDate: vacState.toDate }, createdBy.id);
      vacationSessions.delete(ctx.from.id);

      if (!result.ok) {
        await ctx.reply(`Не вдалося подати заявку: ${result.error}`);
        return;
      }
      await ctx.reply("Заявку подано. Керівника сповіщено — очікуйте на рішення.");
      return;
    }
  }

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
    await ctx.reply(
      "Останній крок — поділіться номером телефону.\n\nТоркніться поля вводу тексту внизу — з'явиться кнопка «Поділитися номером телефону».",
      { reply_markup: new Keyboard().requestContact("Поділитися номером телефону").resized().oneTime() },
    );
    return;
  }
});

bot.on("message:contact", async (ctx) => {
  if (linkRequests.has(ctx.from.id)) {
    linkRequests.delete(ctx.from.id);

    if (ctx.message.contact.user_id !== ctx.from.id) {
      await ctx.reply("Поділіться, будь ласка, власним контактом (кнопкою нижче), а не чужим.");
      return;
    }

    const phone = normalizePhone(ctx.message.contact.phone_number);
    const person = await prisma.person.findUnique({ where: { phone } });

    if (!person) {
      await ctx.reply(
        "Не знайшов у системі акаунт із цим номером телефону. Якщо ви ще не оформлені — зареєструйтесь по QR-коду на об'єкті.",
        { reply_markup: { remove_keyboard: true } },
      );
      return;
    }
    if (person.telegramId) {
      await ctx.reply("Цей номер телефону вже прив'язано до іншого Telegram-акаунта. Зверніться до адміністратора.", {
        reply_markup: { remove_keyboard: true },
      });
      return;
    }

    try {
      await prisma.person.update({ where: { id: person.id }, data: { telegramId: BigInt(ctx.from.id) } });
      await ctx.reply(`Готово, ${person.fullName}! Ваш Telegram прив'язано до акаунта в системі — сповіщення надходитимуть сюди.`, {
        reply_markup: { remove_keyboard: true },
      });
    } catch (error) {
      console.error("Link error:", error);
      await ctx.reply("Сталася помилка. Спробуйте ще раз пізніше.", { reply_markup: { remove_keyboard: true } });
    }
    return;
  }

  const state = registrations.get(ctx.from.id);
  if (!state || state.step !== "phone") return;

  if (ctx.message.contact.user_id !== ctx.from.id) {
    await ctx.reply("Поділіться, будь ласка, власним контактом (кнопкою нижче), а не чужим.");
    return;
  }
  if (!state.fullName || !state.birthDate) return;

  const phone = normalizePhone(ctx.message.contact.phone_number);

  const existingPerson = await prisma.person.findUnique({ where: { phone } });
  if (existingPerson) {
    await ctx.reply(
      "Цей номер телефону вже зареєстровано в системі. Якщо це ваш акаунт — напишіть /link, щоб прив'язати Telegram. " +
        "Якщо це помилка — зверніться до адміністратора об'єкта.",
      { reply_markup: { remove_keyboard: true } },
    );
    registrations.delete(ctx.from.id);
    return;
  }

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
      if (adminEmployment) {
        await sendNotification(adminEmployment.personId, "bot.newHireRequest", { fullName: state.fullName, objectName: state.orgNodeName });
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

// ── Квартальна оцінка (docs v1.3 §4): підтвердження ознайомлення. ──
// Кнопка з'являється в повідомленні лише ПІСЛЯ того, як керівник
// зафіксував, що бесіда відбулася (lib/review.ts::confirmConversation) —
// тобто до цього моменту показувати нема чого.
bot.callbackQuery(/^review_ack:(\d+)$/, async (ctx) => {
  const reviewId = Number(ctx.match[1]);
  const result = await acknowledgeReview(reviewId, BigInt(ctx.from.id));

  if (!result.ok) {
    await ctx.answerCallbackQuery({ text: result.error, show_alert: true });
    return;
  }

  await ctx.answerCallbackQuery({ text: "Дякуємо, підтверджено!" });
  await ctx.editMessageReplyMarkup(undefined).catch(() => {});

  const lines = result.summary.map((r) => `Q${r.quarter} ${r.year}: ${r.weightedScore.toFixed(1)} / 5`);
  await ctx.reply(`Ваша динаміка по кварталах:\n\n${lines.join("\n")}`);
});

bot.callbackQuery(/^ready_for_attestation:(\d+)$/, async (ctx) => {
  const employmentId = Number(ctx.match[1]);
  const result = await confirmReadyForAttestation(employmentId, BigInt(ctx.from.id));

  if (!result.ok) {
    await ctx.answerCallbackQuery({ text: result.error, show_alert: true });
    return;
  }

  await ctx.answerCallbackQuery({ text: "Підтверджено!" });
  await ctx.editMessageReplyMarkup(undefined).catch(() => {});
  await ctx.reply("Готовність до атестації підтверджено. Адміністратор сповіщений.");
});

bot.callbackQuery(/^login_confirm:(\d+)$/, async (ctx) => {
  const challengeId = Number(ctx.match[1]);
  const result = await approveLoginChallenge(challengeId, BigInt(ctx.from.id));

  if (!result.ok) {
    await ctx.answerCallbackQuery({ text: result.error, show_alert: true });
    return;
  }

  await ctx.answerCallbackQuery({ text: "Вхід підтверджено!" });
  await ctx.editMessageReplyMarkup(undefined).catch(() => {});
  await ctx.reply("Вхід підтверджено. Можете повернутись у браузер.");
});

bot.callbackQuery(/^password_reset_confirm:(\d+)$/, async (ctx) => {
  const personId = Number(ctx.match[1]);
  const person = await prisma.person.findUnique({ where: { id: personId } });
  if (!person || person.telegramId !== BigInt(ctx.from.id)) {
    await ctx.answerCallbackQuery({ text: "Це не ваш запит", show_alert: true });
    return;
  }

  const password = await resetCabinetPassword(personId, null);
  await ctx.answerCallbackQuery({ text: "Пароль скинуто" });
  await ctx.editMessageReplyMarkup(undefined).catch(() => {});
  await sendNotificationNow(personId, "auth.cabinetPasswordReset", { password });
});

// ── Пункти чек-ліста з responsibleRole=EMPLOYEE (docs plan-v1.md §6.1,
// напр. "Згода на обробку персональних даних") — виконує сам працівник,
// кнопка приходить push-сповіщенням (lib/onboarding.ts::notifyEmployeeMarkTask)
// або через /tasks, якщо push пропущено.
bot.callbackQuery(/^employee_task_done:(\d+)$/, async (ctx) => {
  const taskId = Number(ctx.match[1]);
  const task = await prisma.task.findUnique({
    where: { id: taskId },
    include: { assignee: { include: { person: true } }, itemTemplate: true },
  });

  if (!task || !task.assignee || task.assignee.person.telegramId !== BigInt(ctx.from.id)) {
    await ctx.answerCallbackQuery({ text: "Це не ваша задача", show_alert: true });
    return;
  }

  const result = await completeTask(taskId, task.assignee.id);
  if (!result.ok) {
    await ctx.answerCallbackQuery({ text: result.error, show_alert: true });
    return;
  }

  await ctx.answerCallbackQuery({ text: "Дякуємо, зафіксовано!" });
  await ctx.editMessageReplyMarkup(undefined).catch(() => {});
  await ctx.reply(`Позначено виконаним: «${task.itemTemplate.title}».`);
});

bot.catch((err) => {
  console.error("Bot error:", err);
});

const SLA_CHECK_QUEUE = "sla-escalation-check";
const BADGE_CHECK_QUEUE = "periodic-badge-check";
const DOCUMENT_RETENTION_QUEUE = "document-retention-cleanup";
const REMINDER_DUE_QUEUE = "reminder-due-check";

/**
 * Черга й планувальник живуть у процесі бота (не окремим третім
 * процесом під PM2) — тут уже є довготривале з'єднання й Telegram-клієнт,
 * яким і так треба надсилати результати обох перевірок.
 */
async function setupQueue() {
  await registerTelegramMessageWorker();

  const boss = await getBoss();

  await boss.createQueue(SLA_CHECK_QUEUE);
  await boss.work(SLA_CHECK_QUEUE, () => checkSlaEscalations());
  await boss.schedule(SLA_CHECK_QUEUE, "0 * * * *"); // щогодини

  await boss.createQueue(BADGE_CHECK_QUEUE);
  await boss.work(BADGE_CHECK_QUEUE, () => runPeriodicBadgeChecks());
  await boss.schedule(BADGE_CHECK_QUEUE, "0 3 * * *"); // раз на добу о 3:00

  await boss.createQueue(ONEC_PASSWORD_DELIVERY_QUEUE);
  await boss.work<{ employmentId: number }>(ONEC_PASSWORD_DELIVERY_QUEUE, async (jobs) => {
    for (const job of jobs) {
      await deliverOnecPassword(job.data.employmentId);
    }
  });

  await boss.createQueue(DOCUMENT_RETENTION_QUEUE);
  await boss.work(DOCUMENT_RETENTION_QUEUE, async () => {
    const { deletedCount } = await cleanupExpiredDocuments();
    if (deletedCount > 0) console.log(`Автоочищення сканів: видалено ${deletedCount}.`);
  });
  await boss.schedule(DOCUMENT_RETENTION_QUEUE, "0 4 * * *"); // раз на добу о 4:00

  await boss.createQueue(REMINDER_DUE_QUEUE);
  await boss.work(REMINDER_DUE_QUEUE, () => checkDueReminders());
  await boss.schedule(REMINDER_DUE_QUEUE, "0 * * * *"); // щогодини, той самий цикл, що й SLA

  console.log("Черга й заплановані перевірки піднято.");
}

setupQueue().catch((err) => console.error("Не вдалося підняти чергу:", err));

process.once("SIGINT", () => bot.stop());
process.once("SIGTERM", () => bot.stop());

bot.start();
console.log("Бот запущено (long polling).");
