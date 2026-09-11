import React, { useState } from "react";
import {
  Users, ListChecks, Network, ShieldCheck, BookOpen, CalendarDays,
  Search, Check, Lock, Clock, AlertTriangle, ChevronRight, ChevronDown,
  Printer, ArrowLeft, UserCog, Building2, Circle, Snowflake, ArrowRightLeft,
  History, Phone, X, Star, Award, ThumbsUp, ThumbsDown, Eye, EyeOff,
} from "lucide-react";

/* ══════════════════ ДОВІДНИКИ ══════════════════ */

const TODAY = new Date("2026-09-11");
const d = (s) => new Date(s);
const fmt = (dt) => dt.toLocaleDateString("uk-UA", { day: "2-digit", month: "2-digit", year: "numeric" });
const addMonths = (dt, m) => { const x = new Date(dt); x.setMonth(x.getMonth() + m); return x; };

const ORG = [
  { id: 1, type: "COMPANY", name: "Компанія", parent: null, path: "1", head: "Савчук М.А." },
  { id: 2, type: "DIVISION", name: "Роздріб", parent: 1, path: "1.2" },
  { id: 3, type: "DIVISION", name: "Кластер 1", parent: 2, path: "1.2.3", head: "Гнатюк В.П." },
  { id: 4, type: "OBJECT", name: "SH01 Шаргород", parent: 3, path: "1.2.3.4", head: "Петренко І.І." },
  { id: 10, type: "DEPARTMENT", name: "Каса", parent: 4, path: "1.2.3.4.10" },
  { id: 11, type: "DEPARTMENT", name: "Гастрономія", parent: 4, path: "1.2.3.4.11" },
  { id: 12, type: "DEPARTMENT", name: "Бакалія", parent: 4, path: "1.2.3.4.12" },
  { id: 13, type: "DEPARTMENT", name: "Кулінарія", parent: 4, path: "1.2.3.4.13" },
  { id: 5, type: "OBJECT", name: "SH02 Мурафа", parent: 3, path: "1.2.3.5", head: "Лисенко Н.В." },
  { id: 14, type: "DEPARTMENT", name: "Каса", parent: 5, path: "1.2.3.5.14" },
  { id: 6, type: "OBJECT", name: "SH03 Джурин", parent: 3, path: "1.2.3.6", head: "Бондар Т.С." },
  { id: 7, type: "DIVISION", name: "Кластер 2", parent: 2, path: "1.2.7", head: "Марчук О.Д." },
  { id: 8, type: "OBJECT", name: "SH04 Тиврів", parent: 7, path: "1.2.7.8" },
  { id: 9, type: "OBJECT", name: "SH05 Гнівань", parent: 7, path: "1.2.7.9" },
  { id: 20, type: "DIVISION", name: "Виробництво", parent: 1, path: "1.20", head: "Дорошенко А.М." },
  { id: 21, type: "OBJECT", name: "TSEH Пекарський цех", parent: 20, path: "1.20.21", head: "Дорошенко А.М." },
  { id: 22, type: "DEPARTMENT", name: "Зміна А", parent: 21, path: "1.20.21.22" },
  { id: 23, type: "DEPARTMENT", name: "Зміна Б", parent: 21, path: "1.20.21.23" },
  { id: 24, type: "OBJECT", name: "WH1 Склад", parent: 20, path: "1.20.24" },
  { id: 30, type: "DIVISION", name: "Адміністрація", parent: 1, path: "1.30" },
  { id: 31, type: "DEPARTMENT", name: "Бухгалтерія", parent: 30, path: "1.30.31" },
  { id: 32, type: "DEPARTMENT", name: "ІТ / 1С", parent: 30, path: "1.30.32" },
];
const nodeById = (id) => ORG.find((n) => n.id === id);

const COMP = {
  c1: { name: "Компанія і структура", valid: null, reset: 12 },
  c2: { name: "Охорона праці", valid: 12 },
  c3: { name: "Пожежна безпека", valid: 12 },
  c4: { name: "Санітарія і HACCP", valid: 12 },
  c5: { name: "Стандарти обслуговування", valid: 24, reset: 18 },
  c6: { name: "Каса і ПРРО", valid: 24, reset: 12 },
  c7: { name: "Ваговий товар і терміни", valid: 24, reset: 18 },
  c8: { name: "Матвідповідальність", valid: 24, reset: 12 },
  c9: { name: "Технологія випічки", valid: 24, reset: 18 },
  c10: { name: "Обладнання цеху", valid: 24, reset: 12 },
  c12: { name: "Безпека дорожнього руху", valid: 12 },
  c11: { name: "Правила торгівлі", valid: 12, bonus: true },
};

const POSITIONS = {
  cashier: { title: "Касир", level: 10, cash: true, liable: true, food: true, comps: ["c1", "c2", "c3", "c4", "c5", "c6", "c7", "c8"] },
  seller: { title: "Продавець", level: 10, liable: true, food: true, comps: ["c1", "c2", "c3", "c4", "c5", "c7", "c8"] },
  seniorCashier: { title: "Старший касир", level: 20, cash: true, liable: true, food: true, comps: ["c1", "c2", "c3", "c4", "c5", "c6", "c7", "c8"] },
  baker: { title: "Пекар", level: 10, food: true, comps: ["c1", "c2", "c3", "c4", "c9", "c10"] },
  doughOp: { title: "Оператор-тістоміс", level: 10, food: true, comps: ["c1", "c2", "c3", "c4", "c10"] },
  culinary: { title: "Працівник кулінарії", level: 10, food: true, comps: ["c1", "c2", "c3", "c4"] },
  loader: { title: "Вантажник", level: 10, comps: ["c1", "c2", "c3"] },
  driver: { title: "Водій", level: 10, liable: true, comps: ["c1", "c2", "c3", "c12"] },
  barista: { title: "Бариста", level: 10, cash: true, food: true, comps: ["c1", "c2", "c3", "c4", "c5", "c6"] },
  admin: { title: "Адміністратор магазину", level: 30, cash: true, liable: true, comps: ["c1", "c2", "c3", "c4", "c5", "c6", "c7", "c8"] },
};

const STATUS = {
  REGISTERED: { label: "Зареєстрований", cls: "bg-slate-100 text-slate-700 border-slate-300" },
  DOCUMENTS_PENDING: { label: "Оформлення", cls: "bg-amber-50 text-amber-800 border-amber-300" },
  TRAINEE: { label: "Стажер", cls: "bg-indigo-50 text-indigo-700 border-indigo-200" },
  READY_FOR_ATTESTATION: { label: "На атестацію", cls: "bg-amber-100 text-amber-900 border-amber-400" },
  ACTIVE: { label: "Працює", cls: "bg-emerald-50 text-emerald-700 border-emerald-200" },
  TRANSFER_PENDING: { label: "Переведення", cls: "bg-sky-50 text-sky-700 border-sky-300" },
  FROZEN: { label: "Заморожений", cls: "bg-cyan-50 text-cyan-700 border-cyan-300" },
  TERMINATION_STARTED: { label: "Звільняється", cls: "bg-rose-50 text-rose-700 border-rose-200" },
  TERMINATED: { label: "Звільнений", cls: "bg-slate-100 text-slate-500 border-slate-300" },
};

const ROLE_LABEL = {
  EMPLOYEE: "Працівник", CURATOR: "Куратор", STORE_ADMIN: "Адміністратор", ONEC_ADMIN: "Оператор 1С",
  ACCOUNTANT: "Бухгалтер", AUDITOR: "Ревізор", COO: "Керівництво", SYSTEM: "Система",
};

/* ══════════════════ ЛЮДИ ══════════════════ */

const seed = [
  { id: 1, name: "Іваненко Іван Іванович", phone: "+380671234501", pos: "cashier", node: 10, status: "ACTIVE", hired: "14.03.2025", done: 22, rating: 35, birth: "12.06.1998",
    recs: { c1: "2025-03-20", c2: "2026-02-10", c3: "2026-02-10", c4: "2026-03-01", c5: "2025-03-25", c6: "2025-03-25", c7: "2025-03-25", c8: "2025-03-20" } },
  { id: 2, name: "Гриценко Оксана Петрівна", phone: "+380671234502", pos: "seller", node: 11, status: "ACTIVE", hired: "01.03.2026", done: 20, rating: 15, birth: "03.02.2001",
    recs: { c1: "2026-03-05", c2: "2026-03-05", c3: "2026-03-05", c4: "2026-03-10", c5: "2026-03-12", c7: "2026-03-12", c8: "2026-03-05" } },
  { id: 3, name: "Мельник Андрій Богданович", phone: "+380671234503", pos: "baker", node: 22, status: "DOCUMENTS_PENDING", hired: "04.09.2026", done: 5, rating: 0, birth: "19.11.1994", recs: {} },
  { id: 4, name: "Костенко Марія Сергіївна", phone: "+380671234504", pos: "cashier", node: 10, status: "REGISTERED", hired: "07.09.2026", done: 1, rating: 0, birth: "28.07.2003", recs: {} },
  { id: 5, name: "Демченко Юрій Олегович", phone: "+380671234505", pos: "loader", node: 24, status: "ACTIVE", hired: "22.01.2024", done: 18, rating: 15, birth: "05.05.1989",
    recs: { c1: "2024-01-25", c2: "2026-01-20", c3: "2026-01-20" } },
  { id: 6, name: "Шевчук Олена Василівна", phone: "+380671234506", pos: "seniorCashier", node: 10, status: "ACTIVE", hired: "08.08.2022", done: 24, rating: 75, birth: "17.09.1990",
    recs: { c1: "2022-08-15", c2: "2026-01-15", c3: "2026-01-15", c4: "2025-09-20", c5: "2025-02-10", c6: "2025-02-10", c7: "2025-02-10", c8: "2025-02-10", c11: "2026-04-02" } },
  { id: 7, name: "Ткаченко Роман Ігорович", phone: "+380671234507", pos: "cashier", node: 10, status: "ACTIVE", hired: "11.02.2025", done: 24, rating: 20, birth: "30.03.1996",
    recs: { c1: "2025-02-15", c2: "2026-02-12", c3: "2026-02-12", c4: "2026-02-20", c5: "2025-02-18", c6: "2025-02-18", c7: "2025-02-18", c8: "2025-02-15" } },
  { id: 9, name: "Романюк Дмитро Павлович", phone: "+380671234509", pos: "doughOp", node: 23, status: "READY_FOR_ATTESTATION", hired: "18.08.2026", done: 17, rating: 10, birth: "09.10.1999",
    recs: { c1: "2026-08-20", c2: "2026-08-20", c3: "2026-08-20", c4: "2026-08-25" } },
  { id: 10, name: "Савченко Ірина Миколаївна", phone: "+380671234510", pos: "culinary", node: 13, status: "TRAINEE", hired: "25.08.2026", done: 14, rating: 0, birth: "21.04.2000",
    recs: { c1: "2026-08-28", c2: "2026-08-28" } },
  { id: 11, name: "Поліщук Богдан Тарасович", phone: "+380671234511", pos: "driver", node: 24, status: "ACTIVE", hired: "07.07.2023", done: 20, rating: 25, birth: "02.02.1992",
    recs: { c1: "2023-07-10", c2: "2025-08-01", c3: "2025-08-01", c12: "2025-08-05" } },
  { id: 12, name: "Кравець Софія Русланівна", phone: "+380671234512", pos: "barista", node: 14, status: "FROZEN", hired: "06.03.2026", done: 24, rating: 10, birth: "11.01.2004",
    freeze: { reason: "Догляд за дитиною", until: "01.03.2027", since: "01.08.2026" },
    recs: { c1: "2026-03-10", c2: "2026-03-10", c3: "2026-03-10", c4: "2026-03-14", c5: "2026-03-16", c6: "2026-03-16" } },
  { id: 13, name: "Захарчук Віталій Степанович", phone: "+380671234513", pos: "cashier", node: 10, status: "TERMINATED", hired: "02.05.2024", fired: "10.04.2026", done: 24, rating: 30, birth: "23.08.1995",
    recs: { c1: "2024-05-06", c2: "2026-01-10", c3: "2026-01-10", c4: "2026-01-15", c5: "2024-05-08", c6: "2024-05-08", c7: "2024-05-08", c8: "2024-05-06" } },
];

const HISTORY = {
  1: [
    ["14.03.2025", "Система", "Статус", "—", "Зареєстрований"],
    ["17.03.2025", "Петренко І.І.", "Посада", "—", "Касир"],
    ["25.03.2025", "Петренко І.І.", "Статус", "Стажер", "Працює"],
    ["02.09.2026", "Петренко І.І.", "Рейтинг", "30", "35"],
  ],
  2: [
    ["01.03.2026", "Система", "Статус", "—", "Зареєстрований"],
    ["05.03.2026", "Петренко І.І.", "Посада", "—", "Продавець"],
    ["12.03.2026", "Петренко І.І.", "Статус", "Стажер", "Працює"],
    ["20.06.2026", "Петренко І.І.", "Відділ", "Бакалія", "Гастрономія"],
  ],
};

const EQUIPMENT = {
  1: [{ inv: "00147", name: "ТЗД Zebra MC330" }, { inv: "00312", name: "Ключ від каси №2" }],
  2: [{ inv: "00088", name: "Ваги Digi SM-100" }],
  6: [{ inv: "00455", name: "Планшет Lenovo M10" }],
};

const VACATIONS = [
  { id: 1, emp: 6, type: "Щорічна", from: "2026-09-14", to: "2026-09-27", status: "APPROVED", by: "Петренко І.І." },
  { id: 2, emp: 1, type: "Щорічна", from: "2026-09-21", to: "2026-10-04", status: "PENDING", by: null },
  { id: 3, emp: 5, type: "Без збереження", from: "2026-09-08", to: "2026-09-12", status: "APPROVED", by: "Дорошенко А.М." },
  { id: 4, emp: 11, type: "Щорічна", from: "2026-09-28", to: "2026-10-11", status: "PENDING", by: null },
];

const RATING_CATS = {
  POSITIVE: [
    { code: "merch", label: "Викладка й порядок", pts: 5 },
    { code: "service", label: "Обслуговування клієнта", pts: 5 },
    { code: "speed", label: "Швидкість і темп", pts: 5 },
    { code: "sanitary", label: "Санітарія і чистота", pts: 5 },
    { code: "initiative", label: "Ініціатива", pts: 8 },
    { code: "help", label: "Підміна, виручив зміну", pts: 8 },
  ],
  NEGATIVE: [
    { code: "late", label: "Запізнення", pts: -5 },
    { code: "standard", label: "Порушення стандарту", pts: -5 },
    { code: "cash_err", label: "Помилка на касі", pts: -8 },
    { code: "sanitary_n", label: "Санітарія", pts: -8 },
    { code: "equip_n", label: "Недбале ставлення до обладнання", pts: -8 },
    { code: "conflict", label: "Конфлікт з клієнтом", pts: -10 },
  ],
};
const catLabel = (code) =>
  [...RATING_CATS.POSITIVE, ...RATING_CATS.NEGATIVE].find((c) => c.code === code)?.label || "—";

const BADGES = {
  profile: { name: "Профіль закрито", auto: true, desc: "Усі компетенції посади чинні" },
  extra: { name: "Понад профіль", auto: true, desc: "Складено бонусні компетенції" },
  fast: { name: "Швидкий старт", auto: true, desc: "Атестація з першого разу" },
  mentor: { name: "Наставник", auto: true, desc: "Троє стажерів склали атестацію з першого разу" },
  clean6: { name: "Без зауважень", auto: true, desc: "Півроку без негативних відміток" },
  y3: { name: "Три роки в команді", auto: true, desc: "Стаж 3 роки" },
  merch_m: { name: "Найкраща викладка", auto: false, desc: "Номінація місяця" },
  save: { name: "Порятунок зміни", auto: false, desc: "Вийшов на підміну в критичний момент" },
  voice: { name: "Голос клієнта", auto: false, desc: "Подяка від покупця" },
};

const BADGE_AWARDS = {
  1: [{ code: "profile", at: "01.09.2026" }, { code: "fast", at: "25.03.2025" }],
  2: [{ code: "profile", at: "12.03.2026" }, { code: "merch_m", at: "01.08.2026", by: "Петренко І.І.", comment: "Оформила зону сезонного товару — найкраща в кластері" }],
  6: [{ code: "profile", at: "10.02.2025" }, { code: "extra", at: "02.04.2026" }, { code: "mentor", at: "14.06.2026" }, { code: "y3", at: "08.08.2025" }, { code: "clean6", at: "01.09.2026" }],
  11: [{ code: "profile", at: "10.07.2023" }, { code: "y3", at: "07.07.2026" }, { code: "save", at: "18.05.2026", by: "Дорошенко А.М.", comment: "Вийшов уночі на позаплановий рейс" }],
};

const LEVELS = [
  { min: 0, name: "Новачок" },
  { min: 25, name: "Впевнений" },
  { min: 60, name: "Надійний" },
  { min: 120, name: "Опора команди" },
];
const levelOf = (score) => [...LEVELS].reverse().find((l) => score >= l.min) || LEVELS[0];
const nextLevel = (score) => LEVELS.find((l) => l.min > score);

const EVENTS = {
  1: [
    { id: 101, date: "02.09.2026", type: "POSITIVE", cat: "help", pts: 8, comment: "Замінив колегу у вихідний, зміна закрита без зривів", author: "Петренко І.І." },
    { id: 102, date: "14.08.2026", type: "NEGATIVE", cat: "late", pts: -5, comment: "Запізнення на 25 хвилин, зміна почалася без касира", author: "Петренко І.І." },
    { id: 103, date: "21.07.2026", type: "POSITIVE", cat: "service", pts: 5, comment: "Спокійно відпрацював конфлікт із покупцем щодо ціни", author: "Петренко І.І." },
    { id: 104, date: "03.07.2026", type: "AUTO", cat: null, pts: 10, comment: "Атестація складена з першого разу", author: "Система" },
  ],
  2: [
    { id: 201, date: "05.09.2026", type: "POSITIVE", cat: "merch", pts: 5, comment: "Перебрала викладку в гастрономії за планограмою без нагадування", author: "Петренко І.І." },
    { id: 202, date: "01.08.2026", type: "AWARD", cat: null, pts: 30, comment: "Номінація «Найкраща викладка» за серпень", author: "Петренко І.І." },
    { id: 203, date: "18.06.2026", type: "POSITIVE", cat: "initiative", pts: 8, comment: "Запропонувала переставити акційний стелаж ближче до входу", author: "Петренко І.І." },
  ],
  6: [
    { id: 601, date: "08.09.2026", type: "POSITIVE", cat: "initiative", pts: 8, comment: "Переписала пам'ятку для нових касирів, тепер вчаться швидше", author: "Гнатюк В.П." },
    { id: 602, date: "14.06.2026", type: "AUTO", cat: null, pts: 15, comment: "Бейдж «Наставник»: троє стажерів склали атестацію з першого разу", author: "Система" },
    { id: 603, date: "02.04.2026", type: "AUTO", cat: null, pts: 15, comment: "Бонусний тест «Правила торгівлі», 92%", author: "Система" },
  ],
  5: [
    { id: 501, date: "28.08.2026", type: "NEGATIVE", cat: "equip_n", pts: -8, comment: "Залишив візок у проході, пошкоджено колесо", author: "Дорошенко А.М." },
    { id: 502, date: "12.08.2026", type: "NEGATIVE", cat: "late", pts: -5, comment: "Запізнення на приймання товару", author: "Дорошенко А.М." },
    { id: 503, date: "30.07.2026", type: "NEGATIVE", cat: "standard", pts: -5, comment: "Не дотримано черговості розвантаження", author: "Дорошенко А.М." },
  ],
};

const REVIEW_CRITERIA = [
  { code: "quality", label: "Якість роботи", hint: "дотримання стандартів і технології" },
  { code: "reliability", label: "Надійність", hint: "графік, дисципліна, домовленості" },
  { code: "speed", label: "Темп", hint: "продуктивність у звичайний і піковий день" },
  { code: "team", label: "Команда", hint: "взаємодія з колегами" },
  { code: "client", label: "Клієнт", hint: "ставлення до покупця" },
  { code: "growth", label: "Ініціатива й розвиток", hint: "пропозиції, готовність вчитися" },
];

const REVIEWS = {
  1: [{ period: "2026-Q2", scores: { quality: 4, reliability: 3, speed: 4, team: 5, client: 4, growth: 3 }, by: "Петренко І.І.", discussed: "05.07.2026", ack: true },
  { period: "2026-Q1", scores: { quality: 4, reliability: 4, speed: 3, team: 4, client: 4, growth: 3 }, by: "Петренко І.І.", discussed: "04.04.2026", ack: true }],
  6: [{ period: "2026-Q2", scores: { quality: 5, reliability: 5, speed: 4, team: 5, client: 5, growth: 5 }, by: "Гнатюк В.П.", discussed: "06.07.2026", ack: true }],
  2: [{ period: "2026-Q2", scores: { quality: 4, reliability: 4, speed: 4, team: 4, client: 5, growth: 4 }, by: "Петренко І.І.", discussed: null, ack: false }],
};

const ACTORS = [
  { id: "admin1", name: "Петренко І.І.", role: "STORE_ADMIN", posTitle: "Адміністратор магазину", scope: "1.2.3.4", scopeName: "SH01 Шаргород", level: 30,
    caps: ["VIEW", "EDIT_PROFILE", "ACTIVATE", "UPLOAD_DOCS", "RUN_ATTESTATION", "RATE", "ASSIGN_EQUIPMENT", "INIT_TERMINATION", "INIT_TRANSFER", "FREEZE", "APPROVE_VACATION", "PRINT_CLEARANCE", "ORG_VIEW", "CATALOG_VIEW", "VACATION_VIEW"] },
  { id: "cluster1", name: "Гнатюк В.П.", role: "STORE_ADMIN", posTitle: "Директор кластера 1", scope: "1.2.3", scopeName: "Кластер 1", level: 40,
    caps: ["VIEW", "EDIT_PROFILE", "ACTIVATE", "RUN_ATTESTATION", "RATE", "INIT_TERMINATION", "INIT_TRANSFER", "APPROVE_TRANSFER", "FREEZE", "APPROVE_VACATION", "PRINT_CLEARANCE", "ORG_VIEW", "CATALOG_VIEW", "VACATION_VIEW"] },
  { id: "onec", name: "Мороз С.В.", role: "ONEC_ADMIN", posTitle: "Оператор 1С", scope: "1", scopeName: "Уся компанія", level: 20,
    caps: ["VIEW", "SET_1C_PASSWORD", "ORG_VIEW", "CATALOG_VIEW"] },
  { id: "acc", name: "Коваль О.П.", role: "ACCOUNTANT", posTitle: "Бухгалтер", scope: "1", scopeName: "Уся компанія", level: 20,
    caps: ["VIEW", "VIEW_DOCS", "UPLOAD_DOCS", "CLOSE_TERMINATION", "PRINT_CLEARANCE", "ORG_VIEW", "CATALOG_VIEW", "VACATION_VIEW"] },
  { id: "aud", name: "Ткач Л.М.", role: "AUDITOR", posTitle: "Бухгалтер-ревізор", scope: "1", scopeName: "Уся компанія", level: 20,
    caps: ["VIEW", "CLEAR_EQUIPMENT", "ASSIGN_EQUIPMENT", "ORG_VIEW", "CATALOG_VIEW"] },
  { id: "coo", name: "Савчук М.А.", role: "COO", posTitle: "Фінансовий директор", scope: "1", scopeName: "Уся компанія", level: 50,
    caps: ["VIEW", "EDIT_PROFILE", "ACTIVATE", "VIEW_DOCS", "RUN_ATTESTATION", "RATE", "REPRIMAND", "INIT_TERMINATION", "APPROVE_TERMINATION", "INIT_TRANSFER", "APPROVE_TRANSFER", "FREEZE", "APPROVE_VACATION", "PRINT_CLEARANCE", "ORG_VIEW", "PERMISSIONS", "CATALOG_VIEW", "CATALOG_EDIT", "VACATION_VIEW"] },
  { id: "sys", name: "Гончар П.С.", role: "SYSADMIN", posTitle: "Системний адміністратор", scope: "1", scopeName: "Уся компанія", level: 20,
    caps: ["VIEW", "ORG_VIEW", "ORG_EDIT", "PERMISSIONS", "CATALOG_VIEW", "CATALOG_EDIT"] },
];

/* ══════════════════ ЛОГІКА ══════════════════ */

const covers = (scope, target) => target === scope || target.startsWith(scope + ".");
const empPath = (e) => nodeById(e.node).path;
const objectOf = (e) => { let n = nodeById(e.node); while (n && n.type !== "OBJECT") n = n.parent ? nodeById(n.parent) : null; return n; };

function validUntil(code, passed) {
  const c = COMP[code];
  if (!c.valid) return null;
  return addMonths(d(passed), c.valid);
}

/** Розрахунок дельти: чого бракує людині для посади */
function delta(emp, posKey) {
  const need = POSITIONS[posKey].comps;
  return need.map((code) => {
    const passed = emp.recs?.[code];
    if (!passed) return { code, state: "missing" };
    const vu = validUntil(code, passed);
    if (vu && vu < TODAY) return { code, state: "expired", until: vu, passed };
    return { code, state: "valid", until: vu, passed };
  });
}
const gaps = (emp, posKey) => delta(emp, posKey).filter((x) => x.state !== "valid");

/** Погоджувач переведення: керівник найближчого спільного DIVISION */
function approverFor(fromNode, toNode) {
  const a = nodeById(fromNode).path.split(".");
  const b = nodeById(toNode).path.split(".");
  let i = 0;
  while (i < a.length && i < b.length && a[i] === b[i]) i++;
  let node = nodeById(Number(a[i - 1]));
  while (node && !(["DIVISION", "COMPANY"].includes(node.type) && node.head)) {
    node = node.parent ? nodeById(node.parent) : null;
  }
  return node;
}

const BASE_ITEMS = [
  { code: "qr", title: "Реєстрація по QR-коду", role: "EMPLOYEE", blocking: true, sla: 0 },
  { code: "pdp", title: "Згода на обробку персональних даних", role: "EMPLOYEE", blocking: true, sla: 24 },
  { code: "profile", title: "Заповнення профілю: посада, відділ, дата виходу", role: "STORE_ADMIN", blocking: true, sla: 24 },
  { code: "curator", title: "Призначення куратора", role: "STORE_ADMIN", blocking: true, sla: 24 },
  { code: "onec", title: "Реєстрація в 1С, генерація пароля", role: "ONEC_ADMIN", blocking: true, sla: 24, input: "пароль" },
  { code: "docs", title: "Прийом і сканування документів", role: "ACCOUNTANT", blocking: true, sla: 72 },
  { code: "hire", title: "Оформлення прийому", role: "ACCOUNTANT", blocking: true, sla: 72 },
  { code: "ot", title: "Вступний інструктаж з охорони праці", role: "STORE_ADMIN", blocking: true, sla: 24 },
  { code: "kit", title: "Видача бейджа, спецодягу, ключів", role: "STORE_ADMIN", blocking: false, sla: 72 },
  { code: "welcome", title: "Надсилання welcomebook і матеріалів", role: "SYSTEM", blocking: true, sla: 0 },
  { code: "study", title: "Ознайомлення з матеріалами за дельтою", role: "EMPLOYEE", blocking: true, sla: 168 },
  { code: "intern", title: "Стажування під наглядом куратора", role: "CURATOR", blocking: true, sla: 336 },
  { code: "attest", title: "Атестація", role: "STORE_ADMIN", blocking: true, sla: 72 },
];

const OFFBOARDING_ITEMS = [
  { code: "init", title: "Ініціація: причина, останній робочий день", role: "STORE_ADMIN", blocking: true, sla: 0 },
  { code: "app", title: "Заява на звільнення прийнята", role: "ACCOUNTANT", blocking: true, sla: 24 },
  { code: "block1c", title: "Блокування облікових записів 1С", role: "ONEC_ADMIN", blocking: true, sla: 4 },
  { code: "equip", title: "Квитування закріпленого обладнання", role: "AUDITOR", blocking: true, sla: 48 },
  { code: "return", title: "Повернення бейджа, ключів, спецодягу", role: "STORE_ADMIN", blocking: true, sla: 24 },
  { code: "noclaims", title: "Відмітка про відсутність претензій", role: "AUDITOR", blocking: true, sla: 0 },
  { code: "approve", title: "Погодження звільнення", role: "COO", blocking: true, sla: 24 },
  { code: "final", title: "Оформлення звільнення", role: "ACCOUNTANT", blocking: true, sla: 0 },
];

function transferItems(hasGaps, liable) {
  return [
    { code: "t_init", title: "Ініціація переведення", role: "STORE_ADMIN", blocking: true, sla: 0 },
    { code: "t_appr", title: "Погодження переведення", role: "COO", blocking: true, sla: 48, approver: true },
    ...(liable ? [{ code: "t_tmc", title: "Передача ТМЦ і зняття обладнання", role: "AUDITOR", blocking: true, sla: 72 }] : []),
    { code: "t_1c", title: "Зміна доступів у 1С і на касі", role: "ONEC_ADMIN", blocking: true, sla: 24 },
    { code: "t_hr", title: "Кадрове оформлення переведення", role: "ACCOUNTANT", blocking: true, sla: 48 },
    ...(hasGaps ? [
      { code: "t_study", title: "Дельта-навчання за новим профілем", role: "CURATOR", blocking: true, sla: 168 },
      { code: "t_att", title: "Атестація за новим профілем", role: "STORE_ADMIN", blocking: true, sla: 72 },
    ] : []),
    { code: "t_eq", title: "Закріплення обладнання на новому місці", role: "STORE_ADMIN", blocking: false, sla: 48 },
  ];
}

function buildTasks(emp) {
  const src = emp.status === "TERMINATION_STARTED" ? OFFBOARDING_ITEMS : BASE_ITEMS;
  const n = emp.status === "TERMINATION_STARTED" ? 3 : emp.done ?? 0;
  return src.map((it, i) => ({ ...it, done: i < n, at: i < n ? "05.09.2026" : null, by: i < n ? ROLE_LABEL[it.role] : null }));
}

/* ══════════════════ ЕЛЕМЕНТИ ══════════════════ */

const Badge = ({ status }) => (
  <span className={`inline-flex items-center border px-2 py-0.5 text-xs font-medium rounded ${STATUS[status].cls}`}>{STATUS[status].label}</span>
);

const AVATAR_BG = ["bg-slate-700", "bg-teal-700", "bg-indigo-700", "bg-amber-700", "bg-rose-700", "bg-emerald-700"];
const Avatar = ({ name, size = 40 }) => {
  const parts = name.split(" ");
  const ini = (parts[0]?.[0] || "") + (parts[1]?.[0] || "");
  const bg = AVATAR_BG[name.length % AVATAR_BG.length];
  return (
    <span className={`flex shrink-0 items-center justify-center rounded-full font-medium text-white ${bg}`}
      style={{ width: size, height: size, fontSize: size * 0.36 }}>{ini}</span>
  );
};

const Section = ({ title, right, children }) => (
  <div className="border border-slate-200 bg-white rounded-md">
    <div className="flex items-center justify-between border-b border-slate-200 px-4 py-2.5">
      <h3 className="text-sm font-semibold text-slate-800">{title}</h3>
      {right}
    </div>
    {children}
  </div>
);

function Checklist({ tasks, actor, onToggle }) {
  const firstOpen = tasks.findIndex((t) => !t.done && t.blocking);
  return (
    <ol className="divide-y divide-slate-100">
      {tasks.map((t, i) => {
        const blocked = t.blocking && firstOpen !== -1 && i > firstOpen && !t.done;
        const mine = actor.role === t.role || (actor.role === "COO" && t.role !== "SYSTEM")
          || (t.approver && actor.caps.includes("APPROVE_TRANSFER"));
        const isNext = i === firstOpen;
        return (
          <li key={t.code} className={`flex gap-3 px-4 py-3 ${isNext ? "bg-amber-50" : ""}`}>
            <div className="flex flex-col items-center pt-0.5">
              <span className={`flex h-5 w-5 items-center justify-center rounded-full border text-white ${
                t.done ? "bg-emerald-600 border-emerald-600" : isNext ? "bg-amber-500 border-amber-500" : "bg-white border-slate-300"}`}>
                {t.done && <Check size={12} strokeWidth={3} />}
                {!t.done && isNext && <Clock size={12} strokeWidth={3} />}
                {!t.done && blocked && <Lock size={10} className="text-slate-400" />}
              </span>
              {i < tasks.length - 1 && <span className={`w-px flex-1 mt-1 ${t.done ? "bg-emerald-300" : "bg-slate-200"}`} />}
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className={`text-sm ${t.done ? "text-slate-500 line-through" : "text-slate-900"}`}>{t.title}</span>
                <span className="rounded bg-slate-100 px-1.5 py-0.5 text-xs text-slate-600 border border-slate-200">
                  {t.approver ? "Погоджувач" : ROLE_LABEL[t.role]}
                </span>
              </div>
              <p className="mt-1 text-xs text-slate-500">
                {t.done ? `Виконано ${t.at} · ${t.by}` : t.sla ? `Норматив ${t.sla} год` : "Автоматично"}
                {t.value && <span className="ml-2 font-mono text-slate-700">{t.value}</span>}
              </p>
            </div>
            <div className="shrink-0">
              {!t.done && t.role !== "SYSTEM" && (mine && !blocked ? (
                <button onClick={() => onToggle(t.code)}
                  className="rounded border border-slate-800 bg-slate-800 px-2.5 py-1 text-xs font-medium text-white hover:bg-slate-700">
                  {t.input ? `Внести ${t.input}` : t.approver ? "Погодити" : "Виконано"}
                </button>
              ) : (
                <span className="text-xs text-slate-400">{blocked ? "Очікує попередній крок" : `Виконує ${ROLE_LABEL[t.role].toLowerCase()}`}</span>
              ))}
              {t.done && <Check size={16} className="text-emerald-600" />}
            </div>
          </li>
        );
      })}
    </ol>
  );
}

/* ══════════════════ ДЕЛЬТА КОМПЕТЕНЦІЙ ══════════════════ */

function CompetencyTable({ emp, posKey }) {
  const rows = delta(emp, posKey);
  const bonus = Object.keys(emp.recs || {}).filter((c) => COMP[c].bonus);
  return (
    <>
      <table className="w-full text-sm">
        <thead className="border-b border-slate-200 bg-slate-50 text-left text-xs text-slate-500">
          <tr>
            <th className="px-4 py-2 font-medium">Компетенція</th>
            <th className="px-4 py-2 font-medium">Складено</th>
            <th className="px-4 py-2 font-medium">Дійсна до</th>
            <th className="px-4 py-2 font-medium text-right">Стан</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {rows.map((r) => (
            <tr key={r.code}>
              <td className="px-4 py-2 text-slate-800">{COMP[r.code].name}</td>
              <td className="px-4 py-2 tabular-nums text-slate-500">{r.passed ? fmt(d(r.passed)) : "—"}</td>
              <td className="px-4 py-2 tabular-nums text-slate-500">{r.until ? fmt(r.until) : r.passed ? "безстроково" : "—"}</td>
              <td className="px-4 py-2 text-right">
                {r.state === "valid" && <span className="rounded bg-emerald-50 border border-emerald-200 px-2 py-0.5 text-xs text-emerald-700">чинна</span>}
                {r.state === "expired" && <span className="rounded bg-amber-50 border border-amber-300 px-2 py-0.5 text-xs text-amber-800">строк вийшов</span>}
                {r.state === "missing" && <span className="rounded bg-slate-100 border border-slate-300 px-2 py-0.5 text-xs text-slate-600">немає</span>}
              </td>
            </tr>
          ))}
          {bonus.map((c) => (
            <tr key={c} className="bg-slate-50">
              <td className="px-4 py-2 text-slate-600">{COMP[c].name} <span className="text-xs text-slate-400">бонусна</span></td>
              <td className="px-4 py-2 tabular-nums text-slate-500">{fmt(d(emp.recs[c]))}</td>
              <td className="px-4 py-2 tabular-nums text-slate-500">{fmt(validUntil(c, emp.recs[c]))}</td>
              <td className="px-4 py-2 text-right"><span className="text-xs text-slate-500">+15 рейтингу</span></td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  );
}

/* ══════════════════ ЕКРАН: ЗАДАЧІ ══════════════════ */

function TasksScreen({ employees, actor, tasksByEmp, vacations, open, goVac }) {
  const rows = [];
  employees.forEach((e) => {
    if (!covers(actor.scope, empPath(e)) || !tasksByEmp[e.id]) return;
    const list = tasksByEmp[e.id];
    const firstOpen = list.findIndex((t) => !t.done && t.blocking);
    list.forEach((t, i) => {
      const blocked = t.blocking && firstOpen !== -1 && i > firstOpen;
      const mine = t.role === actor.role || (t.approver && actor.caps.includes("APPROVE_TRANSFER"));
      if (t.done || blocked || !mine) return;
      rows.push({ emp: e, task: t });
    });
  });
  const vacPending = vacations.filter((v) => v.status === "PENDING" && actor.caps.includes("APPROVE_VACATION")
    && covers(actor.scope, empPath(employees.find((e) => e.id === v.emp))));

  const expiring = employees.filter((e) => covers(actor.scope, empPath(e)) && e.status === "ACTIVE")
    .flatMap((e) => delta(e, e.pos).filter((x) => x.until && x.until > TODAY && x.until < addMonths(TODAY, 2)).map((x) => ({ e, x })));

  return (
    <div className="space-y-4">
      <div className="flex items-baseline justify-between">
        <h2 className="text-xl font-semibold text-slate-900">Мої задачі</h2>
        <span className="text-sm text-slate-500">область: {actor.scopeName}</span>
      </div>

      {rows.length + vacPending.length === 0 && expiring.length === 0 && (
        <div className="border border-dashed border-slate-300 bg-white rounded-md px-6 py-12 text-center">
          <p className="text-sm text-slate-600">Відкритих задач немає.</p>
        </div>
      )}

      {rows.length > 0 && (
        <div className="border border-slate-200 bg-white rounded-md divide-y divide-slate-100">
          {rows.map(({ emp, task }) => (
            <button key={emp.id + task.code} onClick={() => open(emp.id)} className="flex w-full items-center gap-4 px-4 py-3 text-left hover:bg-slate-50">
              <span className="h-8 w-1 rounded bg-amber-500" />
              <Avatar name={emp.name} size={32} />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-slate-900">{task.title}</p>
                <p className="text-xs text-slate-500">{emp.name} · {POSITIONS[emp.pos].title} · {objectOf(emp)?.name}</p>
              </div>
              <ChevronRight size={16} className="text-slate-400" />
            </button>
          ))}
        </div>
      )}

      {vacPending.length > 0 && (
        <Section title="Заявки на відпустку">
          <div className="divide-y divide-slate-100">
            {vacPending.map((v) => {
              const e = employees.find((x) => x.id === v.emp);
              return (
                <button key={v.id} onClick={goVac} className="flex w-full items-center gap-4 px-4 py-3 text-left hover:bg-slate-50">
                  <span className="h-8 w-1 rounded bg-sky-500" />
                  <Avatar name={e.name} size={32} />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-slate-900">{v.type}: {fmt(d(v.from))} — {fmt(d(v.to))}</p>
                    <p className="text-xs text-slate-500">{e.name} · {objectOf(e)?.name}</p>
                  </div>
                  <ChevronRight size={16} className="text-slate-400" />
                </button>
              );
            })}
          </div>
        </Section>
      )}

      {expiring.length > 0 && (
        <Section title="Компетенції, у яких спливає строк" right={<span className="text-xs text-slate-500">найближчі 2 місяці</span>}>
          <div className="divide-y divide-slate-100">
            {expiring.map(({ e, x }, i) => (
              <button key={i} onClick={() => open(e.id)} className="flex w-full items-center gap-4 px-4 py-2.5 text-left hover:bg-slate-50">
                <AlertTriangle size={15} className="text-amber-500" />
                <span className="flex-1 text-sm text-slate-800">{COMP[x.code].name}</span>
                <span className="text-sm text-slate-500">{e.name}</span>
                <span className="tabular-nums text-sm text-amber-700">до {fmt(x.until)}</span>
              </button>
            ))}
          </div>
        </Section>
      )}
    </div>
  );
}

/* ══════════════════ ЕКРАН: ПРАЦІВНИКИ ══════════════════ */

function EmployeesScreen({ employees, actor, open }) {
  const [q, setQ] = useState("");
  const [fs, setFs] = useState("");
  const [fn, setFn] = useState("");
  const visible = employees.filter((e) => covers(actor.scope, empPath(e)));
  const objects = [...new Set(visible.map((e) => objectOf(e)?.id))].map(nodeById);
  const rows = visible.filter((e) => {
    const qq = q.replace(/\s/g, "");
    if (qq && !e.name.toLowerCase().includes(q.toLowerCase()) && !e.phone.includes(qq)) return false;
    if (fs && e.status !== fs) return false;
    if (fn && String(objectOf(e)?.id) !== fn) return false;
    return true;
  });

  return (
    <div className="space-y-4">
      <div className="flex items-baseline justify-between">
        <h2 className="text-xl font-semibold text-slate-900">Працівники</h2>
        <span className="text-sm text-slate-500">{rows.length} з {visible.length}</span>
      </div>
      <div className="flex flex-wrap gap-2">
        <div className="relative">
          <Search size={15} className="absolute left-2.5 top-2.5 text-slate-400" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Прізвище або телефон"
            className="w-64 rounded border border-slate-300 bg-white py-1.5 pl-8 pr-3 text-sm placeholder-slate-400 focus:border-slate-800 focus:outline-none" />
        </div>
        <select value={fn} onChange={(e) => setFn(e.target.value)} className="rounded border border-slate-300 bg-white px-2 py-1.5 text-sm">
          <option value="">Усі об'єкти</option>
          {objects.map((n) => <option key={n.id} value={n.id}>{n.name}</option>)}
        </select>
        <select value={fs} onChange={(e) => setFs(e.target.value)} className="rounded border border-slate-300 bg-white px-2 py-1.5 text-sm">
          <option value="">Усі статуси</option>
          {Object.entries(STATUS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
        </select>
      </div>

      <div className="overflow-hidden border border-slate-200 bg-white rounded-md">
        <table className="w-full text-sm">
          <thead className="border-b border-slate-200 bg-slate-50 text-left text-xs text-slate-500">
            <tr>
              <th className="px-4 py-2 font-medium">Працівник</th>
              <th className="px-4 py-2 font-medium">Посада</th>
              <th className="px-4 py-2 font-medium">Місце роботи</th>
              <th className="px-4 py-2 font-medium">Статус</th>
              <th className="px-4 py-2 font-medium">Компетенції</th>
              <th className="px-4 py-2 font-medium text-right">Рейтинг</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.map((e) => {
              const total = POSITIONS[e.pos].comps.length;
              const ok = total - gaps(e, e.pos).length;
              return (
                <tr key={e.id} onClick={() => open(e.id)} className="cursor-pointer hover:bg-slate-50">
                  <td className="px-4 py-2">
                    <div className="flex items-center gap-2.5">
                      <Avatar name={e.name} size={30} />
                      <div>
                        <p className="font-medium text-slate-900">{e.name}</p>
                        <p className="text-xs tabular-nums text-slate-400">{e.phone}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-2 text-slate-600">{POSITIONS[e.pos].title}</td>
                  <td className="px-4 py-2 text-slate-600">{objectOf(e)?.name}<span className="text-slate-400"> / {nodeById(e.node).name}</span></td>
                  <td className="px-4 py-2"><Badge status={e.status} /></td>
                  <td className="px-4 py-2">
                    <div className="flex items-center gap-2">
                      <div className="h-1.5 w-20 rounded bg-slate-200">
                        <div className={`h-1.5 rounded ${ok === total ? "bg-emerald-500" : "bg-amber-500"}`} style={{ width: `${(ok / total) * 100}%` }} />
                      </div>
                      <span className="tabular-nums text-xs text-slate-500">{ok}/{total}</span>
                    </div>
                  </td>
                  <td className="px-4 py-2 text-right tabular-nums font-medium text-slate-700">{e.rating}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ══════════════════ ЕКРАН: КАРТКА ══════════════════ */

function EmployeeCard({ emp, tasks, actor, back, onToggle, goAttest, goTerm, goTransfer, onFreeze, onUnfreeze, onRehire, setRating, events, badges, reviews, onOpenDialog, onCancelEvent, onPeek }) {
  const [tab, setTab] = useState(tasks ? "process" : "comp");
  const can = (c) => actor.caps.includes(c);
  const obj = objectOf(emp);
  const g = gaps(emp, emp.pos);

  const tabs = [
    ...(tasks ? [["process", emp.status === "TERMINATION_STARTED" ? "Звільнення" : emp.status === "TRANSFER_PENDING" ? "Переведення" : "Онбординг"]] : []),
    ["comp", "Компетенції"], ["docs", "Документи"], ["rating", "Рейтинг"], ["equip", "Обладнання"], ["hist", "Історія"],
  ];

  return (
    <div className="space-y-4">
      <button onClick={back} className="flex items-center gap-1 text-sm text-slate-500 hover:text-slate-900"><ArrowLeft size={15} /> До списку</button>

      <div className="flex flex-wrap items-start justify-between gap-4 border border-slate-200 bg-white rounded-md p-4">
        <div className="flex gap-4">
          <Avatar name={emp.name} size={56} />
          <div>
            <div className="flex flex-wrap items-center gap-3">
              <h2 className="text-xl font-semibold text-slate-900">{emp.name}</h2>
              <Badge status={emp.status} />
            </div>
            <p className="mt-1 text-sm text-slate-600">{POSITIONS[emp.pos].title} · {obj?.name} / {nodeById(emp.node).name}</p>
            <p className="mt-0.5 flex items-center gap-3 text-sm text-slate-500">
              <span className="flex items-center gap-1"><Phone size={12} /> {emp.phone}</span>
              <span>нар. {emp.birth}</span>
              <span>{emp.fired ? `звільнений ${emp.fired}` : `прийнятий ${emp.hired}`}</span>
            </p>
            {emp.freeze && (
              <p className="mt-2 flex items-center gap-1.5 rounded bg-cyan-50 border border-cyan-200 px-2 py-1 text-xs text-cyan-800">
                <Snowflake size={12} /> {emp.freeze.reason}, з {emp.freeze.since}. Планове повернення {emp.freeze.until}. Годинник компетенцій зупинено.
              </p>
            )}
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <button onClick={onPeek} className="flex items-center gap-1.5 rounded border border-slate-300 px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50">
            <Eye size={14} /> Очима працівника
          </button>
          {emp.status === "READY_FOR_ATTESTATION" && can("RUN_ATTESTATION") && (
            <button onClick={goAttest} className="rounded bg-amber-500 px-3 py-1.5 text-sm font-medium text-white hover:bg-amber-600">Провести атестацію</button>
          )}
          {emp.status === "ACTIVE" && can("INIT_TRANSFER") && (
            <button onClick={goTransfer} className="flex items-center gap-1.5 rounded border border-sky-300 px-3 py-1.5 text-sm font-medium text-sky-700 hover:bg-sky-50">
              <ArrowRightLeft size={14} /> Перевести
            </button>
          )}
          {emp.status === "ACTIVE" && can("FREEZE") && (
            <button onClick={onFreeze} className="flex items-center gap-1.5 rounded border border-cyan-300 px-3 py-1.5 text-sm font-medium text-cyan-700 hover:bg-cyan-50">
              <Snowflake size={14} /> Заморозити
            </button>
          )}
          {emp.status === "FROZEN" && can("FREEZE") && (
            <button onClick={onUnfreeze} className="rounded bg-cyan-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-cyan-700">Розморозити</button>
          )}
          {emp.status === "TERMINATED" && can("EDIT_PROFILE") && (
            <button onClick={onRehire} className="rounded bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-700">Прийняти знову</button>
          )}
          {emp.status === "ACTIVE" && can("INIT_TERMINATION") && (
            <button onClick={goTerm} className="rounded border border-rose-300 px-3 py-1.5 text-sm font-medium text-rose-700 hover:bg-rose-50">Звільнення</button>
          )}
          {emp.status === "TERMINATION_STARTED" && can("PRINT_CLEARANCE") && (
            <button onClick={goTerm} className="rounded border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50">Лист узгодження</button>
          )}
        </div>
      </div>

      <div className="flex flex-wrap gap-1 border-b border-slate-200">
        {tabs.map(([k, label]) => (
          <button key={k} onClick={() => setTab(k)}
            className={`-mb-px border-b-2 px-3 py-2 text-sm ${tab === k ? "border-slate-900 font-medium text-slate-900" : "border-transparent text-slate-500 hover:text-slate-800"}`}>
            {label}
          </button>
        ))}
      </div>

      {tab === "process" && tasks && (
        <Section title="Чек-ліст" right={<span className="tabular-nums text-sm text-slate-500">{tasks.filter((t) => t.done).length} з {tasks.length}</span>}>
          <Checklist tasks={tasks} actor={actor} onToggle={onToggle} />
        </Section>
      )}

      {tab === "comp" && (
        <Section title={`Компетенції за профілем «${POSITIONS[emp.pos].title}»`}
          right={<span className="text-sm text-slate-500">{g.length === 0 ? "профіль закрито повністю" : `дельта: ${g.length}`}</span>}>
          <CompetencyTable emp={emp} posKey={emp.pos} />
        </Section>
      )}

      {tab === "docs" && (
        <Section title="Документи">
          {can("VIEW_DOCS") ? (
            <table className="w-full text-sm">
              <tbody className="divide-y divide-slate-100">
                {[["Паспорт / ID-картка", "05.09.2026", null], ["РНОКПП", "05.09.2026", null],
                ["Військово-обліковий документ", "05.09.2026", "до 14.02.2027"], ["Медична книжка", "05.09.2026", "до 30.11.2026"],
                ["Договір про матвідповідальність", "не завантажено", null]].map(([n, s, exp]) => (
                  <tr key={n}>
                    <td className="px-4 py-2.5 text-slate-800">{n}</td>
                    <td className="px-4 py-2.5 text-slate-500">{s}</td>
                    <td className="px-4 py-2.5 text-right">{exp && <span className="rounded bg-amber-50 border border-amber-200 px-2 py-0.5 text-xs text-amber-800">Дійсна {exp}</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <div className="flex items-center gap-2 px-4 py-8 text-sm text-slate-500"><Lock size={15} /> Скани доступні бухгалтерії та керівництву.</div>
          )}
        </Section>
      )}

      {tab === "rating" && (
        <RatingTab emp={emp} actor={actor} events={events} badges={badges} reviews={reviews}
          onOpenDialog={onOpenDialog} onCancel={onCancelEvent} />
      )}

      {tab === "equip" && (
        <Section title="Закріплене обладнання">
          <table className="w-full text-sm">
            <tbody className="divide-y divide-slate-100">
              {(EQUIPMENT[emp.id] || []).map((q) => (
                <tr key={q.inv}>
                  <td className="px-4 py-2.5 font-mono text-slate-500">{q.inv}</td>
                  <td className="px-4 py-2.5 text-slate-800">{q.name}</td>
                </tr>
              ))}
              {!(EQUIPMENT[emp.id] || []).length && <tr><td className="px-4 py-8 text-center text-sm text-slate-500">Обладнання не закріплене.</td></tr>}
            </tbody>
          </table>
        </Section>
      )}

      {tab === "hist" && (
        <Section title="Історія профілю">
          <table className="w-full text-sm">
            <thead className="border-b border-slate-200 bg-slate-50 text-left text-xs text-slate-500">
              <tr><th className="px-4 py-2 font-medium">Дата</th><th className="px-4 py-2 font-medium">Автор</th>
                <th className="px-4 py-2 font-medium">Поле</th><th className="px-4 py-2 font-medium">Було</th><th className="px-4 py-2 font-medium">Стало</th></tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {(HISTORY[emp.id] || [["—", "—", "Записів ще немає", "", ""]]).map((r, i) => (
                <tr key={i}>
                  <td className="px-4 py-2 tabular-nums text-slate-500">{r[0]}</td>
                  <td className="px-4 py-2 text-slate-600">{r[1]}</td>
                  <td className="px-4 py-2 text-slate-800">{r[2]}</td>
                  <td className="px-4 py-2 text-slate-400">{r[3]}</td>
                  <td className="px-4 py-2 text-slate-900">{r[4]}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Section>
      )}
    </div>
  );
}

/* ══════════════════ ЕКРАН: ПЕРЕВЕДЕННЯ ══════════════════ */

function TransferScreen({ emp, tasks, actor, back, onToggle, onStart }) {
  const [toNode, setToNode] = useState(11);
  const [toPos, setToPos] = useState("cashier");
  const started = emp.status === "TRANSFER_PENDING";

  if (started) {
    return (
      <div className="space-y-4">
        <button onClick={back} className="flex items-center gap-1 text-sm text-slate-500 hover:text-slate-900"><ArrowLeft size={15} /> До картки</button>
        <Section title="Чек-ліст переведення" right={<span className="tabular-nums text-sm text-slate-500">{tasks.filter((t) => t.done).length} з {tasks.length}</span>}>
          <Checklist tasks={tasks} actor={actor} onToggle={onToggle} />
        </Section>
      </div>
    );
  }

  const targets = ORG.filter((n) => ["DEPARTMENT", "OBJECT"].includes(n.type) && n.id !== emp.node);
  const g = gaps({ ...emp }, toPos);
  const approver = approverFor(emp.node, toNode);
  const liable = POSITIONS[toPos].liable;

  return (
    <div className="space-y-4">
      <button onClick={back} className="flex items-center gap-1 text-sm text-slate-500 hover:text-slate-900"><ArrowLeft size={15} /> До картки</button>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="border border-slate-200 bg-white rounded-md p-5">
          <h2 className="text-lg font-semibold text-slate-900">Переведення працівника</h2>
          <p className="mt-1 text-sm text-slate-600">{emp.name} · зараз {POSITIONS[emp.pos].title}, {objectOf(emp)?.name} / {nodeById(emp.node).name}</p>

          <div className="mt-4 space-y-3">
            <label className="block">
              <span className="text-sm text-slate-700">Нове місце роботи</span>
              <select value={toNode} onChange={(e) => setToNode(Number(e.target.value))} className="mt-1 w-full rounded border border-slate-300 px-2 py-1.5 text-sm">
                {targets.map((n) => <option key={n.id} value={n.id}>{n.type === "DEPARTMENT" ? `${nodeById(n.parent).name} / ${n.name}` : n.name}</option>)}
              </select>
            </label>
            <label className="block">
              <span className="text-sm text-slate-700">Нова посада</span>
              <select value={toPos} onChange={(e) => setToPos(e.target.value)} className="mt-1 w-full rounded border border-slate-300 px-2 py-1.5 text-sm">
                {Object.entries(POSITIONS).map(([k, p]) => <option key={k} value={k}>{p.title}</option>)}
              </select>
            </label>
            <label className="block">
              <span className="text-sm text-slate-700">Дата переведення</span>
              <input type="date" defaultValue="2026-10-01" className="mt-1 w-full rounded border border-slate-300 px-2 py-1.5 text-sm" />
            </label>
          </div>

          <div className="mt-4 rounded border border-slate-200 bg-slate-50 px-3 py-2 text-sm">
            <p className="text-slate-600">Погоджує: <span className="font-medium text-slate-900">{approver?.head}</span></p>
            <p className="mt-0.5 text-xs text-slate-500">
              керівник вузла «{approver?.name}» — найближчого спільного для старого й нового місця
            </p>
          </div>

          <button onClick={() => onStart(toNode, toPos, g.length > 0, liable)}
            className="mt-4 rounded bg-sky-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-sky-700">
            Надіслати на погодження
          </button>
        </div>

        <Section title="Що доведеться довчити"
          right={<span className={`text-sm ${g.length ? "text-amber-700" : "text-emerald-700"}`}>{g.length ? `${g.length} компетенції` : "нічого"}</span>}>
          <div className="px-4 py-3">
            {g.length === 0 ? (
              <p className="text-sm text-emerald-700">
                Усі компетенції нової посади вже підтверджені й чинні. Навчання й атестація в чек-ліст не потраплять — залишаться тільки доступи, обладнання й кадрове оформлення.
              </p>
            ) : (
              <>
                <p className="text-sm text-slate-600">
                  У чек-ліст переведення додадуться дельта-навчання й атестація тільки за цими позиціями:
                </p>
                <ul className="mt-2 space-y-1">
                  {g.map((x) => (
                    <li key={x.code} className="flex items-center justify-between rounded border border-amber-200 bg-amber-50 px-3 py-1.5 text-sm">
                      <span className="text-amber-900">{COMP[x.code].name}</span>
                      <span className="text-xs text-amber-700">{x.state === "expired" ? `строк вийшов ${fmt(x.until)}` : "не складалася"}</span>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </div>
          <div className="border-t border-slate-200 px-4 py-3">
            <p className="mb-2 text-xs text-slate-500">Повний профіль нової посади</p>
            <CompetencyTable emp={emp} posKey={toPos} />
          </div>
        </Section>
      </div>
    </div>
  );
}

/* ══════════════════ ЕКРАН: ЗВІЛЬНЕННЯ ══════════════════ */

function TerminationScreen({ emp, tasks, actor, back, onToggle, onStart }) {
  const started = emp.status === "TERMINATION_STARTED";
  if (!started) {
    return (
      <div className="space-y-4">
        <button onClick={back} className="flex items-center gap-1 text-sm text-slate-500 hover:text-slate-900"><ArrowLeft size={15} /> До картки</button>
        <div className="max-w-xl border border-slate-200 bg-white rounded-md p-5">
          <h2 className="text-lg font-semibold text-slate-900">Ініціювати звільнення</h2>
          <p className="mt-1 text-sm text-slate-600">{emp.name} · {POSITIONS[emp.pos].title}</p>
          <label className="mt-4 block">
            <span className="text-sm text-slate-700">Причина</span>
            <select className="mt-1 w-full rounded border border-slate-300 px-2 py-1.5 text-sm">
              <option>За власним бажанням</option><option>За угодою сторін</option><option>Ініціатива роботодавця</option>
            </select>
          </label>
          <label className="mt-3 block">
            <span className="text-sm text-slate-700">Останній робочий день</span>
            <input type="date" defaultValue="2026-09-25" className="mt-1 w-full rounded border border-slate-300 px-2 py-1.5 text-sm" />
          </label>
          <button onClick={onStart} className="mt-4 rounded bg-rose-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-rose-700">Почати процедуру</button>
        </div>
      </div>
    );
  }
  const openBlocking = tasks.filter((t) => t.blocking && !t.done);
  const complete = openBlocking.length === 0;
  return (
    <div className="space-y-4">
      <button onClick={back} className="flex items-center gap-1 text-sm text-slate-500 hover:text-slate-900"><ArrowLeft size={15} /> До картки</button>
      <div className="grid gap-4 lg:grid-cols-2">
        <Section title="Чек-ліст звільнення"><Checklist tasks={tasks} actor={actor} onToggle={onToggle} /></Section>
        <div className="space-y-3">
          <div className={`rounded-md border px-4 py-3 text-sm ${complete ? "border-emerald-300 bg-emerald-50 text-emerald-900" : "border-amber-300 bg-amber-50 text-amber-900"}`}>
            {complete ? "Усі обов'язкові пункти закрито. Перешкод для розрахунку немає." : `Не закрито пунктів: ${openBlocking.length}.`}
          </div>
          <div className="border border-slate-200 bg-white rounded-md">
            <div className="flex items-center justify-between border-b border-slate-200 px-4 py-2.5">
              <h3 className="text-sm font-semibold text-slate-800">Лист узгодження звільнення</h3>
              <button className="flex items-center gap-1.5 rounded border border-slate-300 px-2.5 py-1 text-xs hover:bg-slate-50"><Printer size={13} /> Друк</button>
            </div>
            <div className="p-4 font-mono text-xs leading-relaxed text-slate-700">
              {!complete && <p className="mb-3 border border-rose-300 bg-rose-50 px-2 py-1 text-center text-rose-700">ПОПЕРЕДНІЙ — процедуру не завершено</p>}
              <p>№ ЗВ-2026-0042 · {emp.name}</p>
              <p>{POSITIONS[emp.pos].title} · {objectOf(emp)?.name}</p>
              <p className="mt-3 border-t border-slate-200 pt-2">ПУНКТИ УЗГОДЖЕННЯ</p>
              {tasks.filter((t) => t.blocking).map((t, i) => (
                <p key={t.code} className="flex justify-between gap-2">
                  <span className="truncate">{i + 1}. {t.title}</span>
                  <span className={t.done ? "text-emerald-700" : "text-slate-400"}>{t.done ? "✔" : "— очікує"}</span>
                </p>
              ))}
              <p className="mt-3 text-slate-500">Контрольна сума: a3f9c2e1</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ══════════════════ ЕКРАН: АТЕСТАЦІЯ ══════════════════ */

function AttestationScreen({ emp, back, onPass }) {
  const g = gaps(emp, emp.pos);
  const list = g.length ? g.map((x) => x.code) : POSITIONS[emp.pos].comps;
  const [scores, setScores] = useState({});
  const max = list.length * 10;
  const got = Object.values(scores).reduce((a, b) => a + b, 0);
  const pct = max ? Math.round((got / max) * 100) : 0;
  const passed = pct >= 80;
  const answered = Object.keys(scores).length;

  return (
    <div className="space-y-4">
      <button onClick={back} className="flex items-center gap-1 text-sm text-slate-500 hover:text-slate-900"><ArrowLeft size={15} /> До картки</button>
      <div className="flex flex-wrap items-center justify-between gap-4 border border-slate-200 bg-white rounded-md p-4">
        <div>
          <h2 className="text-xl font-semibold text-slate-900">Атестація</h2>
          <p className="mt-1 text-sm text-slate-600">{emp.name} · {POSITIONS[emp.pos].title} · оцінюються лише компетенції з дельти</p>
        </div>
        <div className={`rounded px-4 py-2 text-center ${passed ? "bg-emerald-50 text-emerald-800" : "bg-slate-100 text-slate-600"}`}>
          <p className="tabular-nums text-2xl font-semibold">{pct}%</p>
          <p className="text-xs">прохідний 80%</p>
        </div>
      </div>

      <Section title="Оцінювання" right={<span className="text-sm text-slate-500">{answered} з {list.length}</span>}>
        <ul className="divide-y divide-slate-100">
          {list.map((code) => (
            <li key={code} className="flex items-center justify-between gap-4 px-4 py-2.5">
              <span className="text-sm text-slate-800">{COMP[code].name}</span>
              <div className="flex shrink-0 gap-1">
                {[0, 5, 8, 10].map((v) => (
                  <button key={v} onClick={() => setScores({ ...scores, [code]: v })}
                    className={`h-7 w-10 rounded border text-sm tabular-nums ${scores[code] === v
                      ? v === 0 ? "border-rose-400 bg-rose-50 text-rose-700" : v === 10 ? "border-emerald-500 bg-emerald-50 text-emerald-700" : "border-amber-400 bg-amber-50 text-amber-800"
                      : "border-slate-200 text-slate-400 hover:border-slate-400"}`}>{v}</button>
                ))}
              </div>
            </li>
          ))}
        </ul>
      </Section>

      <div className="flex items-center justify-between gap-3 border border-slate-200 bg-white rounded-md p-4">
        <p className="text-sm text-slate-600">
          {passed ? "Складені компетенції отримають дату й строк дії за довідником." : "Нижче 80% — статус лишиться «Стажер»."}
        </p>
        <button disabled={answered < list.length} onClick={() => onPass(list)}
          className={`rounded px-3 py-1.5 text-sm font-medium text-white ${answered < list.length ? "cursor-not-allowed bg-slate-300" : passed ? "bg-emerald-600 hover:bg-emerald-700" : "bg-slate-800"}`}>
          {passed ? "Зарахувати" : "Зафіксувати незарахування"}
        </button>
      </div>
    </div>
  );
}

/* ══════════════════ ЕКРАН: ВІДПУСТКИ ══════════════════ */

function VacationScreen({ employees, actor, vacations, onDecide }) {
  const [objId, setObjId] = useState(4);
  const days = Array.from({ length: 30 }, (_, i) => i + 1);
  const staff = employees.filter((e) => covers(nodeById(objId).path, empPath(e)) && e.status !== "TERMINATED");
  const vacOf = (empId, day) => vacations.find((v) => {
    if (v.emp !== empId) return false;
    const dt = d(`2026-09-${String(day).padStart(2, "0")}`);
    return dt >= d(v.from) && dt <= d(v.to);
  });

  const pending = vacations.filter((v) => v.status === "PENDING");
  const objects = ORG.filter((n) => n.type === "OBJECT" && covers(actor.scope, n.path));

  const conflictFor = (v) => {
    const e = employees.find((x) => x.id === v.emp);
    const peers = employees.filter((x) => x.pos === e.pos && x.node === e.node && x.id !== e.id);
    const overlapping = vacations.filter((o) => o.id !== v.id && o.status === "APPROVED"
      && peers.some((p) => p.id === o.emp) && d(o.from) <= d(v.to) && d(o.to) >= d(v.from));
    return overlapping.length ? `${overlapping.length} колега з тією ж посадою у відпустці в ті самі дні` : null;
  };

  return (
    <div className="space-y-4">
      <div className="flex items-baseline justify-between">
        <h2 className="text-xl font-semibold text-slate-900">Відпустки</h2>
        <select value={objId} onChange={(e) => setObjId(Number(e.target.value))} className="rounded border border-slate-300 bg-white px-2 py-1 text-sm">
          {objects.map((n) => <option key={n.id} value={n.id}>{n.name}</option>)}
        </select>
      </div>

      {pending.length > 0 && (
        <Section title="Заявки на погодження">
          <div className="divide-y divide-slate-100">
            {pending.map((v) => {
              const e = employees.find((x) => x.id === v.emp);
              const conflict = conflictFor(v);
              return (
                <div key={v.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                  <Avatar name={e.name} size={32} />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-slate-900">{e.name} · {POSITIONS[e.pos].title}</p>
                    <p className="text-xs text-slate-500">{v.type}: {fmt(d(v.from))} — {fmt(d(v.to))} · 14 днів</p>
                    {conflict && (
                      <p className="mt-1 flex items-center gap-1 text-xs text-amber-700"><AlertTriangle size={12} /> {conflict}. Потрібне погодження рівнем вище.</p>
                    )}
                  </div>
                  {actor.caps.includes("APPROVE_VACATION") ? (
                    <div className="flex gap-2">
                      <button onClick={() => onDecide(v.id, "APPROVED")} className="rounded bg-slate-800 px-2.5 py-1 text-xs font-medium text-white hover:bg-slate-700">Погодити</button>
                      <button onClick={() => onDecide(v.id, "REJECTED")} className="rounded border border-slate-300 px-2.5 py-1 text-xs text-slate-700 hover:bg-slate-50">Відхилити</button>
                    </div>
                  ) : <span className="text-xs text-slate-400">Погоджує керівник</span>}
                </div>
              );
            })}
          </div>
        </Section>
      )}

      <Section title="Календар · вересень 2026" right={
        <div className="flex gap-3 text-xs text-slate-500">
          <span className="flex items-center gap-1"><span className="h-2.5 w-2.5 rounded bg-emerald-500" /> погоджено</span>
          <span className="flex items-center gap-1"><span className="h-2.5 w-2.5 rounded bg-amber-400" /> на погодженні</span>
        </div>}>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50">
                <th className="sticky left-0 bg-slate-50 px-3 py-2 text-left font-medium text-slate-500">Працівник</th>
                {days.map((n) => {
                  const wd = d(`2026-09-${String(n).padStart(2, "0")}`).getDay();
                  return <th key={n} className={`w-6 py-2 text-center font-normal ${wd === 0 || wd === 6 ? "bg-slate-100 text-slate-400" : "text-slate-500"}`}>{n}</th>;
                })}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {staff.map((e) => (
                <tr key={e.id}>
                  <td className="sticky left-0 bg-white px-3 py-1.5 text-slate-800">{e.name.split(" ").slice(0, 2).join(" ")}</td>
                  {days.map((n) => {
                    const v = vacOf(e.id, n);
                    const wd = d(`2026-09-${String(n).padStart(2, "0")}`).getDay();
                    return (
                      <td key={n} className={`h-7 ${wd === 0 || wd === 6 ? "bg-slate-50" : ""}`}>
                        {v && <div className={`mx-px h-4 rounded-sm ${v.status === "APPROVED" ? "bg-emerald-500" : "bg-amber-400"}`} />}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>
    </div>
  );
}

/* ══════════════════ ЕКРАН: ДОВІДНИКИ ══════════════════ */

function CatalogScreen({ actor }) {
  const [tab, setTab] = useState("pos");
  const [sel, setSel] = useState("cashier");
  const p = POSITIONS[sel];
  const canEdit = actor.caps.includes("CATALOG_EDIT");

  return (
    <div className="space-y-4">
      <div className="flex items-baseline justify-between">
        <h2 className="text-xl font-semibold text-slate-900">Довідники</h2>
        {!canEdit && <span className="text-sm text-slate-500">Редагування — керівництво і системний адміністратор</span>}
      </div>

      <div className="flex gap-1 border-b border-slate-200">
        {[["pos", "Профілі посад"], ["comp", "Компетенції"], ["mat", "Матеріали"]].map(([k, l]) => (
          <button key={k} onClick={() => setTab(k)}
            className={`-mb-px border-b-2 px-3 py-2 text-sm ${tab === k ? "border-slate-900 font-medium text-slate-900" : "border-transparent text-slate-500 hover:text-slate-800"}`}>{l}</button>
        ))}
      </div>

      {tab === "pos" && (
        <div className="grid gap-4 lg:grid-cols-3">
          <div className="border border-slate-200 bg-white rounded-md p-1 lg:col-span-1">
            {Object.entries(POSITIONS).map(([k, v]) => (
              <button key={k} onClick={() => setSel(k)}
                className={`flex w-full items-center justify-between rounded px-3 py-2 text-left text-sm ${sel === k ? "bg-slate-800 text-white" : "text-slate-700 hover:bg-slate-100"}`}>
                <span>{v.title}</span>
                <span className={`text-xs ${sel === k ? "text-slate-300" : "text-slate-400"}`}>рів. {v.level}</span>
              </button>
            ))}
            {canEdit && <button className="mt-1 w-full rounded border border-dashed border-slate-300 px-3 py-2 text-sm text-slate-500 hover:bg-slate-50">+ Створити профіль</button>}
          </div>

          <div className="space-y-4 lg:col-span-2">
            <Section title={p.title} right={canEdit ? <button className="rounded border border-slate-300 px-2 py-1 text-xs hover:bg-slate-50">Редагувати</button> : null}>
              <div className="grid grid-cols-2 gap-4 px-4 py-3 text-sm sm:grid-cols-4">
                <div><p className="text-slate-500">Рівень</p><p className="tabular-nums text-slate-900">{p.level}</p></div>
                <div><p className="text-slate-500">Каса</p><p className="text-slate-900">{p.cash ? "так" : "ні"}</p></div>
                <div><p className="text-slate-500">Матвідповідальність</p><p className="text-slate-900">{p.liable ? "так" : "ні"}</p></div>
                <div><p className="text-slate-500">Харчова група</p><p className="text-slate-900">{p.food ? "так" : "ні"}</p></div>
              </div>
            </Section>

            <Section title="Навчальний профіль" right={<span className="text-sm text-slate-500">{p.comps.length} компетенцій</span>}>
              <table className="w-full text-sm">
                <thead className="border-b border-slate-200 bg-slate-50 text-left text-xs text-slate-500">
                  <tr><th className="px-4 py-2 font-medium">Компетенція</th><th className="px-4 py-2 font-medium">Строк дії</th>
                    <th className="px-4 py-2 font-medium">Обнулення при перерві</th><th className="px-4 py-2 font-medium text-right">Матеріали</th></tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {p.comps.map((c) => (
                    <tr key={c}>
                      <td className="px-4 py-2 text-slate-800">{COMP[c].name}</td>
                      <td className="px-4 py-2 text-slate-600">{COMP[c].valid ? `${COMP[c].valid} міс` : "безстроково"}</td>
                      <td className="px-4 py-2 text-slate-600">{COMP[c].reset ? `${COMP[c].reset} міс` : "—"}</td>
                      <td className="px-4 py-2 text-right text-slate-500">PDF + тест</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {canEdit && <div className="border-t border-slate-200 px-4 py-2">
                <button className="text-sm text-slate-600 underline underline-offset-2 hover:text-slate-900">+ Додати компетенцію до профілю</button>
              </div>}
            </Section>
          </div>
        </div>
      )}

      {tab === "comp" && (
        <Section title="Компетенції">
          <table className="w-full text-sm">
            <thead className="border-b border-slate-200 bg-slate-50 text-left text-xs text-slate-500">
              <tr><th className="px-4 py-2 font-medium">Назва</th><th className="px-4 py-2 font-medium">Строк дії</th>
                <th className="px-4 py-2 font-medium">Обнулення</th><th className="px-4 py-2 font-medium">Тип</th>
                <th className="px-4 py-2 font-medium text-right">Посад використовують</th></tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {Object.entries(COMP).map(([k, c]) => (
                <tr key={k}>
                  <td className="px-4 py-2 text-slate-800">{c.name}</td>
                  <td className="px-4 py-2 text-slate-600">{c.valid ? `${c.valid} міс` : "безстроково"}</td>
                  <td className="px-4 py-2 text-slate-600">{c.reset ? `${c.reset} міс` : "—"}</td>
                  <td className="px-4 py-2">{c.bonus ? <span className="rounded bg-slate-100 px-1.5 py-0.5 text-xs text-slate-600">бонусна</span> : <span className="text-slate-400 text-xs">обов'язкова</span>}</td>
                  <td className="px-4 py-2 text-right tabular-nums text-slate-600">
                    {Object.values(POSITIONS).filter((p) => p.comps.includes(k)).length}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Section>
      )}

      {tab === "mat" && (
        <Section title="Навчальні матеріали">
          <table className="w-full text-sm">
            <thead className="border-b border-slate-200 bg-slate-50 text-left text-xs text-slate-500">
              <tr><th className="px-4 py-2 font-medium">Матеріал</th><th className="px-4 py-2 font-medium">Тип</th>
                <th className="px-4 py-2 font-medium">Компетенція</th><th className="px-4 py-2 font-medium text-right">Канал</th></tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {[["Welcomebook компанії", "PDF", "c1", "бот"], ["Структура і підпорядкування", "PDF", "c1", "бот"],
              ["Інструкція з охорони праці", "PDF", "c2", "бот"], ["Пожежна безпека: відео-інструктаж", "Відео", "c3", "intranet"],
              ["Санітарія та HACCP", "Відео", "c4", "intranet"], ["Стандарти обслуговування", "PDF", "c5", "бот"],
              ["Робота з ПРРО", "Відео", "c6", "intranet"], ["Ваговий товар і терміни", "PDF", "c7", "бот"],
              ["Технологія випічки", "Відео", "c9", "intranet"]].map(([n, t, c, ch]) => (
                <tr key={n}>
                  <td className="px-4 py-2 text-slate-800">{n}</td>
                  <td className="px-4 py-2 text-slate-600">{t}</td>
                  <td className="px-4 py-2 text-slate-600">{COMP[c].name}</td>
                  <td className="px-4 py-2 text-right">
                    <span className={`rounded px-1.5 py-0.5 text-xs ${ch === "бот" ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-600"}`}>{ch}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Section>
      )}
    </div>
  );
}

/* ══════════════════ ОЦІНЮВАННЯ ══════════════════ */

const TYPE_META = {
  POSITIVE: { label: "Позитив", cls: "bg-emerald-50 text-emerald-700 border-emerald-200" },
  NEGATIVE: { label: "Негатив", cls: "bg-rose-50 text-rose-700 border-rose-200" },
  AWARD: { label: "Номінація", cls: "bg-amber-50 text-amber-800 border-amber-300" },
  REPRIMAND: { label: "Догана", cls: "bg-rose-100 text-rose-900 border-rose-400" },
  AUTO: { label: "Система", cls: "bg-slate-100 text-slate-600 border-slate-300" },
};
const visOf = (t) => (["AWARD", "AUTO"].includes(t) ? "PUBLIC" : t === "REPRIMAND" ? "EMPLOYEE" : "PRIVATE");

function RateDialog({ emp, side, onClose, onSave }) {
  const [cat, setCat] = useState(null);
  const [comment, setComment] = useState("");
  const isNeg = side === "NEGATIVE";
  const isAward = side === "AWARD";
  const [badge, setBadge] = useState("merch_m");
  const cats = isAward ? [] : RATING_CATS[side];
  const ready = isAward ? comment.trim().length > 3 : cat && (!isNeg || comment.trim().length > 3);

  return (
    <div className="fixed inset-0 z-20 flex items-center justify-center bg-slate-900 bg-opacity-40 px-4">
      <div className="w-full max-w-lg rounded-md bg-white p-5">
        <div className="flex items-start justify-between">
          <div>
            <h3 className="text-lg font-semibold text-slate-900">
              {isAward ? "Номінація" : isNeg ? "Зафіксувати негатив" : "Зафіксувати позитив"}
            </h3>
            <p className="mt-0.5 text-sm text-slate-500">{emp.name} · {POSITIONS[emp.pos].title}</p>
          </div>
          <button onClick={onClose}><X size={18} className="text-slate-400" /></button>
        </div>

        {isAward ? (
          <label className="mt-4 block">
            <span className="text-sm text-slate-700">Нагорода</span>
            <select value={badge} onChange={(e) => setBadge(e.target.value)} className="mt-1 w-full rounded border border-slate-300 px-2 py-1.5 text-sm">
              {Object.entries(BADGES).filter(([, b]) => !b.auto).map(([k, b]) => <option key={k} value={k}>{b.name}</option>)}
            </select>
          </label>
        ) : (
          <div className="mt-4">
            <p className="text-sm text-slate-700">Привід</p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {cats.map((c) => (
                <button key={c.code} onClick={() => setCat(c)}
                  className={`rounded border px-2.5 py-1 text-sm ${cat?.code === c.code
                    ? isNeg ? "border-rose-400 bg-rose-50 text-rose-800" : "border-emerald-500 bg-emerald-50 text-emerald-800"
                    : "border-slate-200 text-slate-600 hover:border-slate-400"}`}>
                  {c.label} <span className="tabular-nums text-xs text-slate-400">{c.pts > 0 ? `+${c.pts}` : c.pts}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        <label className="mt-4 block">
          <span className="text-sm text-slate-700">
            Коментар {(isNeg || isAward) && <span className="text-rose-600">обов'язковий</span>}
          </span>
          <textarea value={comment} onChange={(e) => setComment(e.target.value)} rows={3}
            placeholder={isNeg ? "Що саме сталося, коли, які наслідки" : isAward ? "За що саме нагорода" : "Що конкретно зробив добре"}
            className="mt-1 w-full rounded border border-slate-300 px-2 py-1.5 text-sm placeholder-slate-400 focus:border-slate-800 focus:outline-none" />
        </label>

        <p className={`mt-3 flex items-start gap-2 rounded px-3 py-2 text-xs ${isAward ? "bg-amber-50 text-amber-900" : "bg-slate-50 text-slate-600"}`}>
          {isAward ? <Star size={13} className="mt-0.5 shrink-0" /> : <Lock size={13} className="mt-0.5 shrink-0" />}
          {isAward
            ? "Номінацію побачать усі колеги в об'єкті. Не більше однієї на місяць на об'єкт."
            : "Запис бачите тільки ви й керівники вище. Працівнику він не показується. Скасувати можна протягом 48 годин."}
        </p>

        <div className="mt-4 flex justify-end gap-2">
          <button onClick={onClose} className="rounded border border-slate-300 px-3 py-1.5 text-sm hover:bg-slate-50">Скасувати</button>
          <button disabled={!ready}
            onClick={() => onSave({
              type: isAward ? "AWARD" : side,
              cat: cat?.code || null,
              pts: isAward ? 30 : cat.pts,
              comment: comment.trim(),
              badge: isAward ? badge : null,
            })}
            className={`rounded px-3 py-1.5 text-sm font-medium text-white ${!ready ? "cursor-not-allowed bg-slate-300" : isNeg ? "bg-rose-600 hover:bg-rose-700" : "bg-emerald-600 hover:bg-emerald-700"}`}>
            Зберегти
          </button>
        </div>
      </div>
    </div>
  );
}

function RatingTab({ emp, actor, events, badges, reviews, onOpenDialog, onCancel }) {
  const can = (c) => actor.caps.includes(c);
  const lvl = levelOf(emp.rating);
  const nxt = nextLevel(emp.rating);
  const recentNeg = events.filter((e) => e.type === "NEGATIVE").length;
  const recentPos = events.filter((e) => ["POSITIVE", "AWARD"].includes(e.type)).length;
  const review = reviews[0];

  return (
    <div className="space-y-4">
      {can("RATE") && (
        <div className="flex flex-wrap items-center gap-2 border border-slate-200 bg-white rounded-md p-3">
          <button onClick={() => onOpenDialog("POSITIVE")}
            className="flex items-center gap-1.5 rounded bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-700">
            <ThumbsUp size={14} /> Позитив
          </button>
          <button onClick={() => onOpenDialog("NEGATIVE")}
            className="flex items-center gap-1.5 rounded border border-rose-300 px-3 py-1.5 text-sm font-medium text-rose-700 hover:bg-rose-50">
            <ThumbsDown size={14} /> Негатив
          </button>
          {can("REPRIMAND") && (
            <button onClick={() => onOpenDialog("AWARD")}
              className="flex items-center gap-1.5 rounded border border-amber-300 px-3 py-1.5 text-sm font-medium text-amber-800 hover:bg-amber-50">
              <Award size={14} /> Номінація
            </button>
          )}
          <div className="ml-auto flex items-center gap-4 text-sm">
            <span className="text-slate-500">Рівень: <span className="font-medium text-slate-900">{lvl.name}</span></span>
            <span className="text-slate-500">Бал: <span className="tabular-nums font-semibold text-slate-900">{emp.rating}</span></span>
          </div>
        </div>
      )}

      {recentNeg >= 3 && recentPos === 0 && (
        <div className="flex items-start gap-2 rounded-md border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          <AlertTriangle size={15} className="mt-0.5 shrink-0" />
          <span>
            Три негативи поспіль без жодного позитиву. Система надіслала сигнал директору кластера: зазвичай це говорить про проблему в парі «керівник — працівник» або про помилку при доборі, а не про самого працівника.
          </span>
        </div>
      )}

      <Section title="Журнал оцінювання" right={<span className="text-xs text-slate-500">{events.length} записів · впливають на рівень 12 місяців</span>}>
        <table className="w-full text-sm">
          <thead className="border-b border-slate-200 bg-slate-50 text-left text-xs text-slate-500">
            <tr>
              <th className="px-4 py-2 font-medium">Дата</th>
              <th className="px-4 py-2 font-medium">Тип</th>
              <th className="px-4 py-2 font-medium">Привід</th>
              <th className="px-4 py-2 font-medium text-right">Бали</th>
              <th className="px-4 py-2 font-medium">Коментар</th>
              <th className="px-4 py-2 font-medium">Хто поставив</th>
              <th className="px-4 py-2 font-medium text-center">Видимість</th>
              <th className="px-4 py-2" />
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {events.map((e) => {
              const vis = visOf(e.type);
              return (
                <tr key={e.id} className={e.cancelled ? "opacity-40" : ""}>
                  <td className="px-4 py-2 tabular-nums text-slate-500">{e.date}</td>
                  <td className="px-4 py-2">
                    <span className={`rounded border px-1.5 py-0.5 text-xs ${TYPE_META[e.type].cls}`}>{TYPE_META[e.type].label}</span>
                  </td>
                  <td className="px-4 py-2 text-slate-700">{e.cat ? catLabel(e.cat) : "—"}</td>
                  <td className={`px-4 py-2 text-right tabular-nums font-medium ${e.pts < 0 ? "text-rose-600" : "text-emerald-700"}`}>
                    {e.pts > 0 ? `+${e.pts}` : e.pts}
                  </td>
                  <td className="px-4 py-2 text-slate-600">{e.comment}</td>
                  <td className="px-4 py-2 text-slate-500">{e.author}</td>
                  <td className="px-4 py-2 text-center">
                    {vis === "PRIVATE" && <span title="Тільки керівники"><Lock size={13} className="mx-auto text-slate-400" /></span>}
                    {vis === "EMPLOYEE" && <span title="Видно працівнику"><Eye size={13} className="mx-auto text-slate-500" /></span>}
                    {vis === "PUBLIC" && <span title="Видно всім"><Star size={13} className="mx-auto text-amber-500" /></span>}
                  </td>
                  <td className="px-4 py-2 text-right">
                    {!e.cancelled && e.author === actor.name && e.fresh && (
                      <button onClick={() => onCancel(e.id)} className="text-xs text-slate-400 underline underline-offset-2 hover:text-slate-700">скасувати</button>
                    )}
                  </td>
                </tr>
              );
            })}
            {!events.length && <tr><td colSpan={8} className="px-4 py-8 text-center text-sm text-slate-500">Записів ще немає. Перша відмітка з'явиться тут із коментарем і автором.</td></tr>}
          </tbody>
        </table>
      </Section>

      <div className="grid gap-4 lg:grid-cols-2">
        <Section title="Досягнення" right={<span className="text-xs text-slate-500">видно колегам</span>}>
          <div className="px-4 py-3">
            {badges.length ? (
              <div className="space-y-2">
                {badges.map((b) => (
                  <div key={b.code} className="flex items-start gap-3 rounded border border-slate-200 px-3 py-2">
                    <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${BADGES[b.code].auto ? "bg-slate-100 text-slate-600" : "bg-amber-100 text-amber-700"}`}>
                      {BADGES[b.code].auto ? <Check size={15} /> : <Award size={15} />}
                    </span>
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-slate-900">{BADGES[b.code].name}</p>
                      <p className="text-xs text-slate-500">{b.comment || BADGES[b.code].desc} · {b.at}</p>
                      {b.by && <p className="text-xs text-slate-400">нагородив {b.by}</p>}
                    </div>
                  </div>
                ))}
              </div>
            ) : <p className="text-sm text-slate-500">Досягнень ще немає. Перший бейдж зазвичай з'являється після атестації.</p>}
            {nxt && (
              <p className="mt-3 rounded bg-slate-50 px-3 py-2 text-xs text-slate-600">
                До рівня «{nxt.name}» — {nxt.min - emp.rating} балів. Працівник бачить назву наступного рівня, але не свій точний бал.
              </p>
            )}
          </div>
        </Section>

        <Section title="Квартальна оцінка"
          right={review ? <span className="text-xs text-slate-500">{review.period}</span> : null}>
          {review ? (
            <>
              <table className="w-full text-sm">
                <tbody className="divide-y divide-slate-100">
                  {REVIEW_CRITERIA.map((c) => (
                    <tr key={c.code}>
                      <td className="px-4 py-1.5">
                        <p className="text-slate-800">{c.label}</p>
                        <p className="text-xs text-slate-400">{c.hint}</p>
                      </td>
                      <td className="px-4 py-1.5 text-right">
                        <div className="flex justify-end gap-0.5">
                          {[1, 2, 3, 4, 5].map((v) => (
                            <span key={v} className={`h-4 w-4 rounded-sm ${v <= review.scores[c.code] ? "bg-slate-700" : "bg-slate-200"}`} />
                          ))}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="border-t border-slate-200 px-4 py-2.5 text-xs">
                {review.discussed
                  ? <span className="text-slate-500">Обговорено з працівником {review.discussed}{review.ack && " · ознайомлення підтверджено в Telegram"}</span>
                  : <span className="flex items-center gap-1.5 text-amber-700"><AlertTriangle size={12} /> Бесіда не проведена — працівник оцінку не бачить</span>}
              </div>
            </>
          ) : (
            <div className="px-4 py-6 text-center">
              <p className="text-sm text-slate-500">Оцінок ще немає.</p>
              {can("RATE") && <button className="mt-2 rounded border border-slate-300 px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50">Провести оцінку за квартал</button>}
            </div>
          )}
        </Section>
      </div>
    </div>
  );
}

function EmployeeViewModal({ emp, badges, reviews, events, onClose }) {
  const lvl = levelOf(emp.rating);
  const nxt = nextLevel(emp.rating);
  const review = reviews.find((r) => r.discussed);
  const hidden = events.filter((e) => visOf(e.type) === "PRIVATE").length;

  return (
    <div className="fixed inset-0 z-20 flex items-center justify-center bg-slate-900 bg-opacity-50 px-4">
      <div className="w-full max-w-md rounded-md bg-white">
        <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
          <h3 className="text-sm font-semibold text-slate-800">Очима працівника · екран у Telegram</h3>
          <button onClick={onClose}><X size={18} className="text-slate-400" /></button>
        </div>

        <div className="space-y-4 bg-slate-50 px-4 py-4">
          <div className="flex items-center gap-3 rounded-md bg-white p-3">
            <Avatar name={emp.name} size={44} />
            <div>
              <p className="font-medium text-slate-900">{emp.name}</p>
              <p className="text-sm text-slate-500">{POSITIONS[emp.pos].title} · {objectOf(emp)?.name}</p>
            </div>
          </div>

          <div className="rounded-md bg-white p-3">
            <p className="text-xs text-slate-500">Мій рівень</p>
            <p className="text-lg font-semibold text-slate-900">{lvl.name}</p>
            {nxt && <p className="mt-1 text-xs text-slate-500">Наступний рівень: {nxt.name}</p>}
          </div>

          <div className="rounded-md bg-white p-3">
            <p className="text-xs text-slate-500">Мої досягнення</p>
            {badges.length ? (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {badges.map((b) => (
                  <span key={b.code} className={`rounded-full px-2.5 py-1 text-xs ${BADGES[b.code].auto ? "bg-slate-100 text-slate-700" : "bg-amber-100 text-amber-800"}`}>
                    {BADGES[b.code].name}
                  </span>
                ))}
              </div>
            ) : <p className="mt-1 text-sm text-slate-400">Поки немає</p>}
          </div>

          <div className="rounded-md bg-white p-3">
            <p className="text-xs text-slate-500">Моя оцінка за квартал</p>
            {review ? (
              <div className="mt-2 space-y-1">
                {REVIEW_CRITERIA.map((c) => (
                  <div key={c.code} className="flex items-center justify-between">
                    <span className="text-sm text-slate-700">{c.label}</span>
                    <div className="flex gap-0.5">
                      {[1, 2, 3, 4, 5].map((v) => <span key={v} className={`h-3 w-3 rounded-sm ${v <= review.scores[c.code] ? "bg-slate-700" : "bg-slate-200"}`} />)}
                    </div>
                  </div>
                ))}
              </div>
            ) : <p className="mt-1 text-sm text-slate-400">З'явиться після бесіди з керівником</p>}
          </div>
        </div>

        <div className="border-t border-slate-200 px-4 py-3">
          <p className="flex items-start gap-2 text-xs text-slate-500">
            <EyeOff size={13} className="mt-0.5 shrink-0" />
            Приховано від працівника: числовий бал, {hidden} оперативних записів керівника, порівняння з колегами. Це навмисно — оперативні відмітки є робочим інструментом керівника, а не оцінкою, яку людина має читати без розмови.
          </p>
        </div>
      </div>
    </div>
  );
}

function QuickRateScreen({ employees, actor, events, onOpenDialog }) {
  const [q, setQ] = useState("");
  const visible = employees.filter((e) => covers(actor.scope, empPath(e)) && ["ACTIVE", "TRAINEE"].includes(e.status));
  const rows = visible.filter((e) => !q || e.name.toLowerCase().includes(q.toLowerCase()));

  const mine = Object.values(events).flat().filter((e) => e.author === actor.name);
  const pos = mine.filter((e) => ["POSITIVE", "AWARD"].includes(e.type)).length;
  const neg = mine.filter((e) => e.type === "NEGATIVE").length;
  const skew = neg > 0 && pos / neg < 0.5;

  return (
    <div className="space-y-4">
      <div className="flex items-baseline justify-between">
        <h2 className="text-xl font-semibold text-slate-900">Оцінювання</h2>
        <span className="text-sm text-slate-500">область: {actor.scopeName}</span>
      </div>

      <div className={`rounded-md border px-4 py-3 text-sm ${skew ? "border-amber-300 bg-amber-50 text-amber-900" : "border-slate-200 bg-white text-slate-600"}`}>
        Ваші відмітки: <span className="font-medium text-emerald-700">{pos} позитивних</span> · <span className="font-medium text-rose-700">{neg} негативних</span>
        {skew && <span className="block mt-1">Негативу помітно більше за позитив. Люди швидко перестають реагувати на оцінку, яка приходить тільки з поганими новинами.</span>}
      </div>

      <div className="relative max-w-sm">
        <Search size={15} className="absolute left-2.5 top-2.5 text-slate-400" />
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Знайти працівника"
          className="w-full rounded border border-slate-300 bg-white py-1.5 pl-8 pr-3 text-sm placeholder-slate-400 focus:border-slate-800 focus:outline-none" />
      </div>

      <div className="border border-slate-200 bg-white rounded-md divide-y divide-slate-100">
        {rows.map((e) => (
          <div key={e.id} className="flex flex-wrap items-center gap-3 px-4 py-2.5">
            <Avatar name={e.name} size={34} />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-slate-900">{e.name}</p>
              <p className="text-xs text-slate-500">{POSITIONS[e.pos].title} · {nodeById(e.node).name} · {levelOf(e.rating).name}</p>
            </div>
            <div className="flex gap-1.5">
              <button onClick={() => onOpenDialog(e.id, "POSITIVE")}
                className="flex items-center gap-1.5 rounded bg-emerald-600 px-2.5 py-1.5 text-xs font-medium text-white hover:bg-emerald-700">
                <ThumbsUp size={13} /> Позитив
              </button>
              <button onClick={() => onOpenDialog(e.id, "NEGATIVE")}
                className="flex items-center gap-1.5 rounded border border-rose-300 px-2.5 py-1.5 text-xs font-medium text-rose-700 hover:bg-rose-50">
                <ThumbsDown size={13} /> Негатив
              </button>
              {actor.caps.includes("REPRIMAND") && (
                <button onClick={() => onOpenDialog(e.id, "AWARD")}
                  className="flex items-center gap-1.5 rounded border border-amber-300 px-2.5 py-1.5 text-xs font-medium text-amber-800 hover:bg-amber-50">
                  <Award size={13} /> Номінація
                </button>
              )}
            </div>
          </div>
        ))}
        {!rows.length && <p className="px-4 py-8 text-center text-sm text-slate-500">Нікого не знайдено.</p>}
      </div>
    </div>
  );
}

/* ══════════════════ ЕКРАН: СТРУКТУРА ══════════════════ */

function OrgScreen({ employees, actor }) {
  const [sel, setSel] = useState(4);
  const [openIds, setOpenIds] = useState([1, 2, 3, 4, 20, 21]);
  const toggle = (id) => setOpenIds((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));
  const children = (pid) => ORG.filter((n) => n.parent === pid);
  const node = nodeById(sel);
  const staff = employees.filter((e) => covers(node.path, empPath(e)) && e.status !== "TERMINATED");

  const render = (n, depth) => {
    const kids = children(n.id);
    const isOpen = openIds.includes(n.id);
    return (
      <div key={n.id}>
        <div onClick={() => setSel(n.id)}
          className={`flex cursor-pointer items-center gap-1 rounded px-2 py-1 text-sm ${sel === n.id ? "bg-slate-800 text-white" : "text-slate-700 hover:bg-slate-100"}`}
          style={{ paddingLeft: depth * 14 + 8 }}>
          {kids.length ? <button onClick={(e) => { e.stopPropagation(); toggle(n.id); }} className="shrink-0">{isOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}</button> : <span className="w-3.5 shrink-0" />}
          {n.type === "OBJECT" ? <Building2 size={13} className="shrink-0" /> : n.type === "DEPARTMENT" ? <Circle size={7} className="shrink-0" /> : <Network size={13} className="shrink-0" />}
          <span className="truncate">{n.name}</span>
        </div>
        {isOpen && kids.map((k) => render(k, depth + 1))}
      </div>
    );
  };

  const byPos = {};
  staff.forEach((e) => { byPos[e.pos] = (byPos[e.pos] || 0) + 1; });
  const plan = { cashier: 4, seller: 3, admin: 1, baker: 4, doughOp: 2, culinary: 2, barista: 1, loader: 2, driver: 2, seniorCashier: 1 };

  return (
    <div className="space-y-4">
      <h2 className="text-xl font-semibold text-slate-900">Структура компанії</h2>
      <div className="grid gap-4 lg:grid-cols-3">
        <div className="border border-slate-200 bg-white rounded-md p-2">{render(ORG[0], 0)}</div>
        <div className="space-y-4 lg:col-span-2">
          <Section title={node.name} right={<span className="text-xs text-slate-500">{node.type} · шлях {node.path}</span>}>
            <div className="grid grid-cols-3 gap-4 px-4 py-3 text-sm">
              <div><p className="text-slate-500">Керівник</p><p className="text-slate-900">{node.head || "не призначено"}</p></div>
              <div><p className="text-slate-500">Працівників</p><p className="tabular-nums text-slate-900">{staff.length}</p></div>
              <div><p className="text-slate-500">Заморожено</p><p className="tabular-nums text-slate-900">{staff.filter((e) => e.status === "FROZEN").length}</p></div>
            </div>
          </Section>
          <Section title="Штатний розпис">
            <table className="w-full text-sm">
              <thead className="border-b border-slate-200 bg-slate-50 text-left text-xs text-slate-500">
                <tr><th className="px-4 py-2 font-medium">Посада</th><th className="px-4 py-2 font-medium text-right">План</th>
                  <th className="px-4 py-2 font-medium text-right">Факт</th><th className="px-4 py-2 font-medium text-right">Стан</th></tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {Object.entries(byPos).map(([p, fact]) => {
                  const pl = plan[p] || 1;
                  return (
                    <tr key={p}>
                      <td className="px-4 py-2 text-slate-800">{POSITIONS[p].title}</td>
                      <td className="px-4 py-2 text-right tabular-nums text-slate-600">{pl}</td>
                      <td className="px-4 py-2 text-right tabular-nums text-slate-600">{fact}</td>
                      <td className="px-4 py-2 text-right text-xs">{fact >= pl ? <span className="text-emerald-700">укомплектовано</span> : <span className="text-amber-700">бракує {pl - fact}</span>}</td>
                    </tr>
                  );
                })}
                {!Object.keys(byPos).length && <tr><td colSpan={4} className="px-4 py-8 text-center text-sm text-slate-500">У цьому вузлі немає працівників.</td></tr>}
              </tbody>
            </table>
          </Section>
        </div>
      </div>
    </div>
  );
}

/* ══════════════════ КОРІНЬ ══════════════════ */

export default function App() {
  const [actorId, setActorId] = useState("admin1");
  const [screen, setScreen] = useState("tasks");
  const [selId, setSelId] = useState(null);
  const [employees, setEmployees] = useState(seed);
  const [vacations, setVacations] = useState(VACATIONS);
  const [tasksByEmp, setTasksByEmp] = useState(() =>
    Object.fromEntries(seed.filter((e) => ["REGISTERED", "DOCUMENTS_PENDING", "TRAINEE", "READY_FOR_ATTESTATION"].includes(e.status)).map((e) => [e.id, buildTasks(e)]))
  );
  const [toast, setToast] = useState(null);
  const [freezeFor, setFreezeFor] = useState(null);
  const [events, setEvents] = useState(EVENTS);
  const [badges, setBadges] = useState(BADGE_AWARDS);
  const [dialog, setDialog] = useState(null);   // {empId, side}
  const [peek, setPeek] = useState(null);

  const actor = ACTORS.find((a) => a.id === actorId);
  const emp = employees.find((e) => e.id === selId);
  const flash = (m) => { setToast(m); setTimeout(() => setToast(null), 3000); };
  const patch = (id, p) => setEmployees((l) => l.map((e) => (e.id === id ? { ...e, ...p } : e)));

  const toggleTask = (id, code) => {
    setTasksByEmp((all) => {
      const list = all[id].map((t) => (t.code === code ? { ...t, done: true, at: "11.09.2026", by: actor.name, value: t.input ? "K7#2f91q" : undefined } : t));
      const target = employees.find((e) => e.id === id);
      if (target.status === "DOCUMENTS_PENDING" && ["onec", "docs", "hire"].every((c) => list.find((t) => t.code === c)?.done)) {
        patch(id, { status: "TRAINEE" }); flash("Оформлення завершено — статус «Стажер»");
      }
      if (target.status === "TRAINEE" && list.find((t) => t.code === "intern")?.done) {
        patch(id, { status: "READY_FOR_ATTESTATION" }); flash("Стажування закрито — заявка на атестацію");
      }
      if (target.status === "TRANSFER_PENDING" && list.every((t) => !t.blocking || t.done)) {
        patch(id, { status: "ACTIVE", node: target.pendingNode, pos: target.pendingPos });
        flash("Переведення завершено");
      }
      if (target.status === "TERMINATION_STARTED" && list.every((t) => !t.blocking || t.done)) {
        flash("Усі пункти закрито — бухгалтер може проводити розрахунок");
      }
      return { ...all, [id]: list };
    });
  };

  const startTransfer = (toNode, toPos, hasGaps, liable) => {
    patch(emp.id, { status: "TRANSFER_PENDING", pendingNode: toNode, pendingPos: toPos });
    setTasksByEmp((all) => ({ ...all, [emp.id]: transferItems(hasGaps, liable).map((t, i) => ({ ...t, done: i === 0, at: i === 0 ? "11.09.2026" : null, by: i === 0 ? actor.name : null })) }));
    flash(`Переведення надіслано на погодження${hasGaps ? " · дельта-навчання додано в чек-ліст" : " · навчання не потрібне"}`);
    setScreen("card");
  };

  const startTermination = () => {
    patch(emp.id, { status: "TERMINATION_STARTED" });
    setTasksByEmp((all) => ({ ...all, [emp.id]: OFFBOARDING_ITEMS.map((t, i) => ({ ...t, done: i === 0, at: i === 0 ? "11.09.2026" : null, by: i === 0 ? actor.name : null })) }));
    flash("Процедуру звільнення розпочато");
  };

  const rehire = () => {
    const g = gaps(emp, emp.pos);
    patch(emp.id, { status: g.length ? "DOCUMENTS_PENDING" : "ACTIVE", fired: null, hired: "11.09.2026", done: 4 });
    if (g.length) setTasksByEmp((all) => ({ ...all, [emp.id]: buildTasks({ ...emp, done: 4 }) }));
    flash(g.length
      ? `Повторний найм · дельта: ${g.map((x) => COMP[x.code].name).join(", ")}`
      : "Повторний найм · усі компетенції чинні, навчання не потрібне, одразу в роботу");
  };

  const saveEvent = ({ type, cat, pts, comment, badge }) => {
    const id = dialog.empId;
    const ev = { id: Date.now(), date: "11.09.2026", type, cat, pts, comment, author: actor.name, fresh: true };
    setEvents((all) => ({ ...all, [id]: [ev, ...(all[id] || [])] }));
    patch(id, { rating: employees.find((e) => e.id === id).rating + pts });
    if (badge) {
      setBadges((all) => ({ ...all, [id]: [...(all[id] || []), { code: badge, at: "11.09.2026", by: actor.name, comment }] }));
    }
    setDialog(null);
    flash(type === "NEGATIVE"
      ? "Запис збережено · видимий лише керівникам, працівнику не показується"
      : type === "AWARD" ? "Номінацію збережено · її побачать колеги" : "Позитив збережено");
  };

  const cancelEvent = (id, evId) => {
    setEvents((all) => ({ ...all, [id]: all[id].map((e) => (e.id === evId ? { ...e, cancelled: true } : e)) }));
    flash("Запис скасовано · він лишається в аудиті з причиною");
  };

  const nav = [
    { id: "tasks", label: "Мої задачі", icon: ListChecks },
    { id: "employees", label: "Працівники", icon: Users },
    { id: "rate", label: "Оцінювання", icon: Star, cap: "RATE" },
    { id: "vac", label: "Відпустки", icon: CalendarDays, cap: "VACATION_VIEW" },
    { id: "catalog", label: "Довідники", icon: BookOpen, cap: "CATALOG_VIEW" },
    { id: "org", label: "Структура", icon: Network, cap: "ORG_VIEW" },
    { id: "perm", label: "Права доступу", icon: ShieldCheck, cap: "PERMISSIONS" },
  ].filter((n) => !n.cap || actor.caps.includes(n.cap));

  return (
    <div className="flex min-h-screen bg-slate-100 text-slate-900">
      <aside className="flex w-56 shrink-0 flex-col bg-slate-900">
        <div className="border-b border-slate-800 px-4 py-4">
          <p className="text-sm font-semibold text-white">Персонал</p>
          <p className="mt-0.5 text-xs text-slate-400">Прийом · навчання · рух · звільнення</p>
        </div>
        <nav className="flex-1 py-2">
          {nav.map((n) => {
            const Icon = n.icon;
            const active = screen === n.id || (n.id === "employees" && ["card", "attest", "term", "transfer"].includes(screen));
            return (
              <button key={n.id} onClick={() => { setScreen(n.id); setSelId(null); }}
                className={`flex w-full items-center gap-2.5 border-l-2 px-4 py-2.5 text-sm ${active ? "border-amber-500 bg-slate-800 text-white" : "border-transparent text-slate-400 hover:bg-slate-800 hover:text-slate-200"}`}>
                <Icon size={16} /> {n.label}
              </button>
            );
          })}
        </nav>
        <div className="border-t border-slate-800 px-4 py-3"><p className="text-xs text-slate-500">Прототип · дані умовні</p></div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 bg-white px-6 py-3">
          <div className="flex items-center gap-2 text-sm text-slate-500">
            <UserCog size={15} /><span>Увійти як</span>
            <select value={actorId} onChange={(e) => { setActorId(e.target.value); setScreen("tasks"); setSelId(null); }}
              className="rounded border border-slate-300 px-2 py-1 text-sm text-slate-900">
              {ACTORS.map((a) => <option key={a.id} value={a.id}>{a.name} — {a.posTitle}</option>)}
            </select>
          </div>
          <span className="text-sm text-slate-500">Область: <span className="text-slate-900">{actor.scopeName}</span></span>
        </header>

        <main className="flex-1 overflow-auto px-6 py-6">
          {screen === "tasks" && <TasksScreen employees={employees} actor={actor} tasksByEmp={tasksByEmp} vacations={vacations}
            open={(id) => { setSelId(id); setScreen("card"); }} goVac={() => setScreen("vac")} />}
          {screen === "employees" && <EmployeesScreen employees={employees} actor={actor} open={(id) => { setSelId(id); setScreen("card"); }} />}
          {screen === "card" && emp && (
            <EmployeeCard emp={emp} tasks={tasksByEmp[emp.id]} actor={actor}
              back={() => setScreen("employees")}
              onToggle={(c) => toggleTask(emp.id, c)}
              goAttest={() => setScreen("attest")} goTerm={() => setScreen("term")} goTransfer={() => setScreen("transfer")}
              onFreeze={() => setFreezeFor(emp.id)}
              onUnfreeze={() => { patch(emp.id, { status: "ACTIVE", freeze: null }); flash("Розморожено · строки компетенцій продовжено на час паузи"); }}
              onRehire={rehire}
              events={(events[emp.id] || [])} badges={(badges[emp.id] || [])} reviews={(REVIEWS[emp.id] || [])}
              onOpenDialog={(side) => setDialog({ empId: emp.id, side })}
              onCancelEvent={(evId) => cancelEvent(emp.id, evId)}
              onPeek={() => setPeek(emp.id)}
              setRating={(x) => { patch(emp.id, { rating: emp.rating + x }); flash("Оцінку збережено"); }} />
          )}
          {screen === "attest" && emp && (
            <AttestationScreen emp={emp} back={() => setScreen("card")}
              onPass={(list) => {
                const recs = { ...emp.recs };
                list.forEach((c) => { recs[c] = "2026-09-11"; });
                patch(emp.id, { status: "ACTIVE", recs, rating: emp.rating + 10 });
                setScreen("card"); flash("Атестацію зараховано · компетенції отримали строк дії");
              }} />
          )}
          {screen === "term" && emp && <TerminationScreen emp={emp} tasks={tasksByEmp[emp.id] || []} actor={actor}
            back={() => setScreen("card")} onToggle={(c) => toggleTask(emp.id, c)} onStart={startTermination} />}
          {screen === "transfer" && emp && <TransferScreen emp={emp} tasks={tasksByEmp[emp.id] || []} actor={actor}
            back={() => setScreen("card")} onToggle={(c) => toggleTask(emp.id, c)} onStart={startTransfer} />}
          {screen === "vac" && <VacationScreen employees={employees} actor={actor} vacations={vacations}
            onDecide={(id, st) => { setVacations((l) => l.map((v) => (v.id === id ? { ...v, status: st, by: actor.name } : v))); flash(st === "APPROVED" ? "Відпустку погоджено" : "Заявку відхилено"); }} />}
          {screen === "rate" && <QuickRateScreen employees={employees} actor={actor} events={events}
            onOpenDialog={(empId, side) => setDialog({ empId, side })} />}
          {screen === "catalog" && <CatalogScreen actor={actor} />}
          {screen === "org" && <OrgScreen employees={employees} actor={actor} />}
          {screen === "perm" && (
            <div className="space-y-4">
              <h2 className="text-xl font-semibold text-slate-900">Права доступу</h2>
              <Section title="Матриця можливостей">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="border-b border-slate-200 bg-slate-50 text-xs text-slate-500">
                      <tr><th className="px-4 py-2 text-left font-medium">Можливість</th>
                        {ACTORS.map((a) => <th key={a.id} className="px-3 py-2 text-left font-medium">{a.posTitle}</th>)}</tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {[["VIEW", "Бачити працівників"], ["VIEW_DOCS", "Переглядати скани"], ["SET_1C_PASSWORD", "Вносити пароль 1С"],
                      ["RUN_ATTESTATION", "Приймати атестацію"], ["INIT_TRANSFER", "Ініціювати переведення"], ["APPROVE_TRANSFER", "Погоджувати переведення"],
                      ["FREEZE", "Заморожувати"], ["APPROVE_VACATION", "Погоджувати відпустки"], ["INIT_TERMINATION", "Ініціювати звільнення"],
                      ["APPROVE_TERMINATION", "Погоджувати звільнення"], ["CATALOG_EDIT", "Редагувати довідники"]].map(([cap, label]) => (
                        <tr key={cap}>
                          <td className="px-4 py-2 text-slate-800">{label}</td>
                          {ACTORS.map((a) => (
                            <td key={a.id} className="px-3 py-2">
                              {a.caps.includes(cap)
                                ? <span className="rounded bg-slate-100 px-1.5 py-0.5 text-xs text-slate-700">{a.scope === "1" ? "компанія" : a.scopeName}</span>
                                : <span className="text-slate-300">—</span>}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Section>
            </div>
          )}
        </main>
      </div>

      {freezeFor && (
        <div className="fixed inset-0 z-20 flex items-center justify-center bg-slate-900 bg-opacity-40 px-4">
          <div className="w-full max-w-md rounded-md bg-white p-5">
            <div className="flex items-start justify-between">
              <h3 className="text-lg font-semibold text-slate-900">Заморозити працівника</h3>
              <button onClick={() => setFreezeFor(null)}><X size={18} className="text-slate-400" /></button>
            </div>
            <div className="mt-4 space-y-3">
              <label className="block">
                <span className="text-sm text-slate-700">Причина</span>
                <select className="mt-1 w-full rounded border border-slate-300 px-2 py-1.5 text-sm">
                  <option>Догляд за дитиною</option><option>Мобілізація</option><option>Тривале лікування</option>
                  <option>Навчання</option><option>Сезонна пауза</option>
                </select>
              </label>
              <label className="block">
                <span className="text-sm text-slate-700">Планове повернення</span>
                <input type="date" defaultValue="2027-03-01" className="mt-1 w-full rounded border border-slate-300 px-2 py-1.5 text-sm" />
              </label>
              <label className="flex items-center gap-2 text-sm text-slate-700">
                <input type="checkbox" defaultChecked className="rounded border-slate-300" /> Звільнити штатну одиницю для заміни
              </label>
              <label className="flex items-center gap-2 text-sm text-slate-700">
                <input type="checkbox" defaultChecked className="rounded border-slate-300" /> Здати закріплене обладнання
              </label>
            </div>
            <p className="mt-3 rounded bg-cyan-50 border border-cyan-200 px-3 py-2 text-xs text-cyan-900">
              Строки дії компетенцій зупиняються на час паузи й продовжуються при поверненні.
            </p>
            <div className="mt-4 flex justify-end gap-2">
              <button onClick={() => setFreezeFor(null)} className="rounded border border-slate-300 px-3 py-1.5 text-sm hover:bg-slate-50">Скасувати</button>
              <button onClick={() => {
                patch(freezeFor, { status: "FROZEN", freeze: { reason: "Догляд за дитиною", since: "11.09.2026", until: "01.03.2027" } });
                setFreezeFor(null); flash("Працівника заморожено · доступи 1С заблоковано");
              }} className="rounded bg-cyan-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-cyan-700">Заморозити</button>
            </div>
          </div>
        </div>
      )}

      {dialog && (
        <RateDialog emp={employees.find((e) => e.id === dialog.empId)} side={dialog.side}
          onClose={() => setDialog(null)} onSave={saveEvent} />
      )}

      {peek && (
        <EmployeeViewModal emp={employees.find((e) => e.id === peek)}
          badges={badges[peek] || []} reviews={REVIEWS[peek] || []} events={events[peek] || []}
          onClose={() => setPeek(null)} />
      )}

      {toast && (
        <div className="fixed bottom-6 left-1/2 z-30 max-w-lg -translate-x-1/2 rounded bg-slate-900 px-4 py-2 text-center text-sm text-white shadow-lg">{toast}</div>
      )}
    </div>
  );
}
