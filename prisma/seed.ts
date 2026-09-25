import { prisma } from "../lib/prisma";
import { hashPassword } from "../lib/auth";
import {
  OrgNodeType,
  Role,
  EmploymentStatus,
  Capability,
  ScopeType,
  MaterialType,
  CompetencySource,
  ChecklistModule,
  ProcessType,
  ActionType,
  RatingSide,
} from "../generated/prisma/client";

function parseUaDate(s: string): Date {
  const [day, month, year] = s.split(".").map(Number);
  return new Date(Date.UTC(year, month - 1, day));
}

function parseIsoDate(s: string): Date {
  return new Date(`${s}T00:00:00.000Z`);
}

function addMonthsUtc(date: Date, months: number): Date {
  const result = new Date(date);
  result.setUTCMonth(result.getUTCMonth() + months);
  return result;
}

type OrgNodeRef = { id: number; path: string };

async function upsertOrgNode(params: {
  code: string;
  type: OrgNodeType;
  name: string;
  parent: OrgNodeRef | null;
  address?: string;
}): Promise<OrgNodeRef> {
  const existing = await prisma.orgNode.findUnique({ where: { code: params.code } });
  if (existing) return existing;

  const created = await prisma.orgNode.create({
    data: {
      code: params.code,
      type: params.type,
      name: params.name,
      parentId: params.parent?.id ?? null,
      address: params.address,
      path: "0",
    },
  });

  const path = params.parent ? `${params.parent.path}.${created.id}` : `${created.id}`;
  return prisma.orgNode.update({ where: { id: created.id }, data: { path } });
}

async function seedOrgTree() {
  const root = await upsertOrgNode({ code: "ROOT", type: OrgNodeType.COMPANY, name: "Коровай", parent: null });

  const retail = await upsertOrgNode({ code: "RETAIL", type: OrgNodeType.DIVISION, name: "Роздріб", parent: root });
  const cluster1 = await upsertOrgNode({ code: "CLUSTER1", type: OrgNodeType.DIVISION, name: "Кластер 1", parent: retail });
  const cluster2 = await upsertOrgNode({ code: "CLUSTER2", type: OrgNodeType.DIVISION, name: "Кластер 2", parent: retail });

  const shops: { code: string; name: string; cluster: OrgNodeRef }[] = [
    { code: "SH01", name: "Коровай Шаргород", cluster: cluster1 },
    { code: "SH02", name: "Магазин SH02", cluster: cluster1 },
    { code: "SH03", name: "Магазин SH03", cluster: cluster1 },
    { code: "SH04", name: "Магазин SH04", cluster: cluster2 },
    { code: "SH05", name: "Магазин SH05", cluster: cluster2 },
    { code: "SH06", name: "Магазин SH06", cluster: cluster2 },
  ];
  for (const shop of shops) {
    await upsertOrgNode({ code: shop.code, type: OrgNodeType.OBJECT, name: shop.name, parent: shop.cluster });
  }

  const production = await upsertOrgNode({ code: "PRODUCTION", type: OrgNodeType.DIVISION, name: "Виробництво", parent: root });
  await upsertOrgNode({ code: "TSEH", type: OrgNodeType.OBJECT, name: "Пекарський цех", parent: production });
  await upsertOrgNode({ code: "WH1", type: OrgNodeType.OBJECT, name: "Склад", parent: production });

  const admin = await upsertOrgNode({ code: "ADMIN", type: OrgNodeType.DIVISION, name: "Адміністрація", parent: root });
  const adminDepartments = [
    { code: "ACC", name: "Бухгалтерія" },
    { code: "ONEC", name: "ІТ / 1С" },
    { code: "AUDIT", name: "Ревізійна служба" },
    { code: "COMMERCIAL", name: "Комерційний відділ" },
    { code: "TRANSPORT", name: "Транспорт" },
  ];
  for (const dept of adminDepartments) {
    await upsertOrgNode({ code: dept.code, type: OrgNodeType.DIVISION, name: dept.name, parent: admin });
  }
}

type PositionProfileSeed = {
  title: string;
  level: number;
  canBeCurator?: boolean;
  requiresCashierAccount?: boolean;
  isMateriallyLiable?: boolean;
  isFoodHandling?: boolean;
  systemRole?: Role;
};

// docs/hr-system-catalogs-v1.1.md §3
const positionProfiles: PositionProfileSeed[] = [
  { title: "Власник", level: 60 },
  { title: "Фінансовий директор", level: 50, systemRole: Role.COO },
  { title: "Директор кластера", level: 40, canBeCurator: true },
  { title: "Категорійний менеджер", level: 40, canBeCurator: true },
  { title: "Маркетолог", level: 30 },
  {
    title: "Адміністратор магазину",
    level: 30,
    canBeCurator: true,
    requiresCashierAccount: true,
    isMateriallyLiable: true,
    systemRole: Role.STORE_ADMIN,
  },
  {
    title: "Завідуючий цехом",
    level: 30,
    canBeCurator: true,
    isMateriallyLiable: true,
    systemRole: Role.STORE_ADMIN,
  },
  { title: "Технолог / майстер", level: 20, canBeCurator: true, isFoodHandling: true },
  { title: "Старший продавець", level: 20, canBeCurator: true, requiresCashierAccount: true, isMateriallyLiable: true },
  { title: "Старший касир", level: 20, canBeCurator: true, requiresCashierAccount: true, isMateriallyLiable: true },
  { title: "Продавець 1 категорії", level: 15, canBeCurator: true, requiresCashierAccount: true, isMateriallyLiable: true },
  { title: "Продавець", level: 10, requiresCashierAccount: true, isMateriallyLiable: true },
  { title: "Касир", level: 10, requiresCashierAccount: true, isMateriallyLiable: true },
  { title: "Бариста", level: 10, requiresCashierAccount: true, isFoodHandling: true },
  { title: "Працівник кулінарії", level: 10, isFoodHandling: true },
  { title: "Пекар", level: 10, canBeCurator: true, isFoodHandling: true },
  { title: "Оператор-тістоміс", level: 10, isFoodHandling: true },
  { title: "Працівник пекарні", level: 10, isFoodHandling: true },
  { title: "Працівник м'ясного цеху", level: 10, isFoodHandling: true },
  { title: "Вантажник", level: 10 },
  { title: "Комірник", level: 20, canBeCurator: true, isMateriallyLiable: true },
  { title: "Водій", level: 10, isMateriallyLiable: true },
  { title: "Експедитор", level: 10, isMateriallyLiable: true },
  { title: "Охоронник", level: 10 },
  { title: "Прибиральниця", level: 10 },
  { title: "Головний бухгалтер", level: 40, canBeCurator: true, systemRole: Role.ACCOUNTANT },
  { title: "Бухгалтер", level: 20, systemRole: Role.ACCOUNTANT },
  {
    title: "Бухгалтер-касир",
    level: 20,
    requiresCashierAccount: true,
    isMateriallyLiable: true,
    systemRole: Role.ACCOUNTANT,
  },
  { title: "Бухгалтер-ревізор", level: 20, systemRole: Role.AUDITOR },
  { title: "Оператор 1С", level: 20, systemRole: Role.ONEC_ADMIN },
  { title: "Системний адміністратор", level: 20, systemRole: Role.SYSADMIN },
];

// Автопідбір модулів онбордингу (docs v1.1 §6.2). Касовий/МВО/Харчове/
// Керівний виводяться з наявних прапорців посади; Роздріб/Складський/
// Транспортний/Охорона/Офісний — з явних переліків посад у тій самій
// таблиці докс (немає прапорця-джерела, тож перелік явний).
const RETAIL_TITLES = new Set(["Продавець", "Старший продавець", "Продавець 1 категорії"]);
const WAREHOUSE_TITLES = new Set(["Комірник", "Вантажник"]);
const TRANSPORT_TITLES = new Set(["Водій", "Експедитор"]);
const SECURITY_TITLES = new Set(["Охоронник"]);
const OFFICE_TITLES = new Set([
  "Власник",
  "Фінансовий директор",
  "Маркетолог",
  "Категорійний менеджер",
  "Головний бухгалтер",
  "Бухгалтер",
  "Бухгалтер-касир",
  "Бухгалтер-ревізор",
  "Оператор 1С",
  "Системний адміністратор",
]);

function computeModuleFlags(p: PositionProfileSeed): ChecklistModule[] {
  const flags = new Set<ChecklistModule>();
  if (p.requiresCashierAccount) flags.add(ChecklistModule.CASHIER);
  if (p.isMateriallyLiable) flags.add(ChecklistModule.MVO);
  if (p.isFoodHandling) flags.add(ChecklistModule.FOOD);
  if (p.level >= 30) flags.add(ChecklistModule.MANAGEMENT);
  if (RETAIL_TITLES.has(p.title)) flags.add(ChecklistModule.RETAIL);
  if (WAREHOUSE_TITLES.has(p.title)) flags.add(ChecklistModule.WAREHOUSE);
  if (TRANSPORT_TITLES.has(p.title)) flags.add(ChecklistModule.TRANSPORT);
  if (SECURITY_TITLES.has(p.title)) flags.add(ChecklistModule.SECURITY);
  if (OFFICE_TITLES.has(p.title)) flags.add(ChecklistModule.OFFICE);
  return [...flags];
}

type CompetencySeed = {
  code: string;
  name: string;
  category?: string;
  validMonths?: number;
  resetOnBreakMonths?: number;
  isBonus?: boolean;
};

// docs/hr-transfers-competencies-v1.2.md §1, таблиця «Стартові строки дії».
// category — групування для навігації в "Довідниках" (2026-09-25),
// запропоновано мною, не з докс; лише 6 категорій на 12 компетенцій.
const competencies: CompetencySeed[] = [
  { code: "COMPANY_BASICS", name: "Компанія і структура", category: "Загальне", resetOnBreakMonths: 12 },
  { code: "LABOR_SAFETY", name: "Охорона праці", category: "Охорона праці й безпека", validMonths: 12 },
  { code: "FIRE_SAFETY", name: "Пожежна безпека", category: "Охорона праці й безпека", validMonths: 12 },
  { code: "ROAD_SAFETY", name: "Безпека дорожнього руху", category: "Охорона праці й безпека", validMonths: 12 },
  { code: "SANITATION_HACCP", name: "Санітарія і HACCP", category: "Санітарія та якість", validMonths: 12 },
  { code: "SERVICE_STANDARDS", name: "Стандарти обслуговування", category: "Торгівля й обслуговування", validMonths: 24, resetOnBreakMonths: 18 },
  { code: "WEIGHED_GOODS_DATES", name: "Ваговий товар і терміни", category: "Торгівля й обслуговування", validMonths: 24, resetOnBreakMonths: 18 },
  { code: "TRADE_RULES", name: "Правила торгівлі", category: "Торгівля й обслуговування", validMonths: 12, isBonus: true },
  { code: "CASHIER_PRRO", name: "Каса і ПРРО", category: "Каса та матвідповідальність", validMonths: 24, resetOnBreakMonths: 12 },
  { code: "MATERIAL_LIABILITY", name: "Матвідповідальність", category: "Каса та матвідповідальність", validMonths: 24, resetOnBreakMonths: 12 },
  { code: "BAKING_TECHNOLOGY", name: "Технологія випічки", category: "Виробництво", validMonths: 24, resetOnBreakMonths: 18 },
  { code: "BAKERY_EQUIPMENT", name: "Обладнання цеху", category: "Виробництво", validMonths: 24, resetOnBreakMonths: 12 },
];

async function seedPositionProfiles() {
  for (const p of positionProfiles) {
    const moduleFlags = computeModuleFlags(p);
    await prisma.positionProfile.upsert({
      where: { title: p.title },
      update: { moduleFlags },
      create: {
        title: p.title,
        level: p.level,
        canBeCurator: p.canBeCurator ?? false,
        requiresCashierAccount: p.requiresCashierAccount ?? false,
        isMateriallyLiable: p.isMateriallyLiable ?? false,
        isFoodHandling: p.isFoodHandling ?? false,
        systemRole: p.systemRole,
        moduleFlags,
      },
    });
  }
}

async function seedCompetencies() {
  for (const c of competencies) {
    await prisma.competency.upsert({
      where: { code: c.code },
      update: {},
      create: {
        code: c.code,
        name: c.name,
        category: c.category,
        validMonths: c.validMonths,
        resetOnBreakMonths: c.resetOnBreakMonths,
        isBonus: c.isBonus ?? false,
      },
    });
  }
}

// Яку компетенцію вимагає посада — з prototype/hr-prototype-v3.jsx,
// об'єкт POSITIONS (поле comps). Це не таблиця з докс, але це справжні,
// узгоджені із замовником дані, а не вигадані навмання. Покриває лише
// 10 із 31 профілю — тих, що присутні в прототипі; решта свідомо без
// компетенцій, доки замовник не дасть даних.
const positionCompetencyMap: Record<string, string[]> = {
  "Касир": ["COMPANY_BASICS", "LABOR_SAFETY", "FIRE_SAFETY", "SANITATION_HACCP", "SERVICE_STANDARDS", "CASHIER_PRRO", "WEIGHED_GOODS_DATES", "MATERIAL_LIABILITY"],
  "Продавець": ["COMPANY_BASICS", "LABOR_SAFETY", "FIRE_SAFETY", "SANITATION_HACCP", "SERVICE_STANDARDS", "WEIGHED_GOODS_DATES", "MATERIAL_LIABILITY"],
  "Старший касир": ["COMPANY_BASICS", "LABOR_SAFETY", "FIRE_SAFETY", "SANITATION_HACCP", "SERVICE_STANDARDS", "CASHIER_PRRO", "WEIGHED_GOODS_DATES", "MATERIAL_LIABILITY"],
  "Пекар": ["COMPANY_BASICS", "LABOR_SAFETY", "FIRE_SAFETY", "SANITATION_HACCP", "BAKING_TECHNOLOGY", "BAKERY_EQUIPMENT"],
  "Оператор-тістоміс": ["COMPANY_BASICS", "LABOR_SAFETY", "FIRE_SAFETY", "SANITATION_HACCP", "BAKERY_EQUIPMENT"],
  "Працівник кулінарії": ["COMPANY_BASICS", "LABOR_SAFETY", "FIRE_SAFETY", "SANITATION_HACCP"],
  "Вантажник": ["COMPANY_BASICS", "LABOR_SAFETY", "FIRE_SAFETY"],
  "Водій": ["COMPANY_BASICS", "LABOR_SAFETY", "FIRE_SAFETY", "ROAD_SAFETY"],
  "Бариста": ["COMPANY_BASICS", "LABOR_SAFETY", "FIRE_SAFETY", "SANITATION_HACCP", "SERVICE_STANDARDS", "CASHIER_PRRO"],
  "Адміністратор магазину": ["COMPANY_BASICS", "LABOR_SAFETY", "FIRE_SAFETY", "SANITATION_HACCP", "SERVICE_STANDARDS", "CASHIER_PRRO", "WEIGHED_GOODS_DATES", "MATERIAL_LIABILITY"],
};

async function seedPositionCompetencies() {
  for (const [title, codes] of Object.entries(positionCompetencyMap)) {
    const profile = await prisma.positionProfile.findUnique({ where: { title } });
    if (!profile) continue;

    for (const code of codes) {
      const competency = await prisma.competency.findUnique({ where: { code } });
      if (!competency) continue;

      const existing = await prisma.positionCompetency.findUnique({
        where: { positionProfileId_competencyId: { positionProfileId: profile.id, competencyId: competency.id } },
      });
      if (!existing) {
        await prisma.positionCompetency.create({
          data: { positionProfileId: profile.id, competencyId: competency.id },
        });
      }
    }
  }
}

// Навчальні матеріали — 9 записів з prototype/hr-prototype-v3.jsx,
// вкладка «Матеріали» в CatalogScreen. Відео — тільки intranet, PDF —
// можна й через бот (docs/hr-system-plan-v1.md §9.1).
type MaterialSeed = { title: string; type: MaterialType; competencyCode: string; sendViaBot: boolean };

const materials: MaterialSeed[] = [
  { title: "Welcomebook компанії", type: MaterialType.PDF, competencyCode: "COMPANY_BASICS", sendViaBot: true },
  { title: "Структура і підпорядкування", type: MaterialType.PDF, competencyCode: "COMPANY_BASICS", sendViaBot: true },
  { title: "Інструкція з охорони праці", type: MaterialType.PDF, competencyCode: "LABOR_SAFETY", sendViaBot: true },
  { title: "Пожежна безпека: відео-інструктаж", type: MaterialType.VIDEO, competencyCode: "FIRE_SAFETY", sendViaBot: false },
  { title: "Санітарія та HACCP", type: MaterialType.VIDEO, competencyCode: "SANITATION_HACCP", sendViaBot: false },
  { title: "Стандарти обслуговування", type: MaterialType.PDF, competencyCode: "SERVICE_STANDARDS", sendViaBot: true },
  { title: "Робота з ПРРО", type: MaterialType.VIDEO, competencyCode: "CASHIER_PRRO", sendViaBot: false },
  { title: "Ваговий товар і терміни", type: MaterialType.PDF, competencyCode: "WEIGHED_GOODS_DATES", sendViaBot: true },
  { title: "Технологія випічки", type: MaterialType.VIDEO, competencyCode: "BAKING_TECHNOLOGY", sendViaBot: false },
];

async function seedMaterials() {
  for (const m of materials) {
    const competency = await prisma.competency.findUnique({ where: { code: m.competencyCode } });
    if (!competency) continue;

    const existing = await prisma.material.findFirst({ where: { title: m.title, competencyId: competency.id } });
    if (!existing) {
      await prisma.material.create({
        data: { title: m.title, type: m.type, competencyId: competency.id, sendViaBot: m.sendViaBot },
      });
    }
  }
}

// Права — докс/hr-system-catalogs-v1.1.md §4.4 «Стартова матриця», але не
// напряму: замовник (2026-09-14) попросив розділити ДВІ осі — "що можна"
// (профіль доступу, AccessProfile — просто набір можливостей) і "де саме"
// (область, задається лише в момент призначення профілю посаді). Це усуває
// дублювання, яке було в попередній версії матриці: OWN_OBJECT_FULL і
// OWN_SUBTREE_FULL — буквально один і той самий список можливостей під
// двома різними назвами лише через різну область.
type AccessProfileSeed = { name: string; capabilities: Capability[] };

const ACCESS_PROFILES: AccessProfileSeed[] = [
  { name: "Перегляд власного профілю", capabilities: [Capability.VIEW_EMPLOYEE] },
  { name: "Керівництво зміною", capabilities: [Capability.CLOSE_INTERNSHIP, Capability.RATE_POSITIVE_NEGATIVE] },
  {
    // = стара OWN_OBJECT_FULL/OWN_SUBTREE_FULL без FREEZE/INIT_TRANSFER/
    // APPROVE_TRANSFER немає в catalogs-v1.1 §4.4 (той документ — до появи
    // переведення й заморозки, v1.2). FREEZE/INIT_TRANSFER лишаю тут
    // (ініціює керівник об'єкта чи вище); APPROVE_TRANSFER — окремим
    // профілем нижче, він потрібен лише з рівня директора кластера.
    name: "Повне управління персоналом",
    capabilities: [
      Capability.VIEW_EMPLOYEE,
      Capability.EDIT_PROFILE,
      Capability.ACTIVATE_EMPLOYEE,
      Capability.ASSIGN_CURATOR,
      Capability.UPLOAD_DOCUMENTS,
      Capability.RUN_ATTESTATION,
      Capability.RATE_POSITIVE_NEGATIVE,
      Capability.ASSIGN_EQUIPMENT,
      Capability.INIT_TERMINATION,
      Capability.PRINT_CLEARANCE,
      Capability.MANAGE_MATERIALS,
      Capability.MANAGE_REMINDERS,
      Capability.FREEZE,
      Capability.INIT_TRANSFER,
      // Відпустки (v1.2 §4) — прямий керівник об'єкта чи піддерева й погоджує
      // звичайні заявки. Ескальовані (>14 днів/конфлікт/поза графіком) все
      // одно перевіряються по області: canApproveVacation вимагає ширшу за
      // OWN_OBJECT область для них — сам факт наявності APPROVE_VACATION тут
      // ще не дає погоджувати ескальовані заявки об'єктному адміну.
      Capability.APPROVE_VACATION,
      Capability.PRINT_BADGE,
      Capability.MANAGE_VACANCIES,
      Capability.MANAGE_ANNOUNCEMENTS,
    ],
  },
  { name: "Аналітика", capabilities: [Capability.VIEW_ANALYTICS] },
  { name: "Погодження переведення", capabilities: [Capability.APPROVE_TRANSFER] },
  { name: "Перегляд і оцінка підлеглих", capabilities: [Capability.VIEW_EMPLOYEE, Capability.RATE_POSITIVE_NEGATIVE] },
  {
    name: "Бухгалтерія",
    capabilities: [
      Capability.VIEW_EMPLOYEE,
      Capability.VIEW_DOCUMENTS,
      Capability.UPLOAD_DOCUMENTS,
      Capability.CLOSE_TERMINATION,
      Capability.PRINT_CLEARANCE,
      Capability.MANAGE_REMINDERS,
    ],
  },
  { name: "Ревізія обладнання", capabilities: [Capability.VIEW_EMPLOYEE, Capability.CLEAR_EQUIPMENT, Capability.ASSIGN_EQUIPMENT] },
  { name: "Адміністрування 1С", capabilities: [Capability.VIEW_EMPLOYEE, Capability.SET_1C_PASSWORD] },
  {
    name: "Адміністрування системи",
    capabilities: [
      Capability.MANAGE_TEMPLATES,
      Capability.MANAGE_ORG_STRUCTURE,
      Capability.MANAGE_MATERIALS,
      Capability.MANAGE_PERMISSIONS,
      Capability.VIEW_AUDIT_LOG,
      Capability.RESET_CABINET_PASSWORD,
      Capability.FORCE_COMPLETE_TASK,
    ],
  },
  { name: "Повний доступ", capabilities: Object.values(Capability) },
];

type AssignmentSeed = { profileName: string; scope: ScopeType };

const explicitAssignments: Record<string, AssignmentSeed[]> = {
  "Адміністратор магазину": [{ profileName: "Повне управління персоналом", scope: ScopeType.OWN_OBJECT }],
  "Завідуючий цехом": [{ profileName: "Повне управління персоналом", scope: ScopeType.OWN_OBJECT }],
  "Директор кластера": [
    { profileName: "Повне управління персоналом", scope: ScopeType.OWN_SUBTREE },
    { profileName: "Аналітика", scope: ScopeType.OWN_SUBTREE },
    { profileName: "Погодження переведення", scope: ScopeType.OWN_SUBTREE },
  ],
  "Категорійний менеджер": [
    { profileName: "Перегляд і оцінка підлеглих", scope: ScopeType.SUBORDINATES },
    { profileName: "Аналітика", scope: ScopeType.COMPANY },
  ],
  "Бухгалтер": [{ profileName: "Бухгалтерія", scope: ScopeType.COMPANY }],
  // "Бухгалтер-касир" не названий у матриці окремо — даю ті самі права,
  // що й "Бухгалтер" (той самий systemRole ACCOUNTANT). Це моє припущення,
  // не буквальний рядок з докс.
  "Бухгалтер-касир": [{ profileName: "Бухгалтерія", scope: ScopeType.COMPANY }],
  "Бухгалтер-ревізор": [{ profileName: "Ревізія обладнання", scope: ScopeType.COMPANY }],
  "Оператор 1С": [{ profileName: "Адміністрування 1С", scope: ScopeType.COMPANY }],
  "Системний адміністратор": [{ profileName: "Адміністрування системи", scope: ScopeType.COMPANY }],
  "Фінансовий директор": [{ profileName: "Повний доступ", scope: ScopeType.COMPANY }],
  "Власник": [{ profileName: "Повний доступ", scope: ScopeType.COMPANY }],
};

// Рівень 20 без явного рядка в матриці: раніше один "кошик" мішав дві різні
// області (відділ для перегляду, підлеглі для оцінки) — тепер це рівно два
// призначення з різною областю замість штучного одного профілю.
const SHIFT_LEAD_ASSIGNMENTS: AssignmentSeed[] = [
  { profileName: "Перегляд власного профілю", scope: ScopeType.OWN_DEPARTMENT },
  { profileName: "Керівництво зміною", scope: ScopeType.SUBORDINATES },
];

const SELF_VIEW_ASSIGNMENTS: AssignmentSeed[] = [{ profileName: "Перегляд власного профілю", scope: ScopeType.SELF }];

// "Маркетолог" не підпадає під жоден рядок матриці й не має рівневого
// кошика (рівень 30 без власного рядка) — свідома прогалина з докс,
// не з мого боку. Прав не отримує, доки замовник не уточнить.
const NO_GRANTS_TITLES = new Set(["Маркетолог"]);

async function seedAccessProfiles(): Promise<Map<string, number>> {
  const profileIdByName = new Map<string, number>();

  for (const p of ACCESS_PROFILES) {
    const profile = await prisma.accessProfile.upsert({ where: { name: p.name }, update: {}, create: { name: p.name } });
    profileIdByName.set(p.name, profile.id);

    for (const capability of p.capabilities) {
      const existing = await prisma.accessProfileCapability.findFirst({ where: { accessProfileId: profile.id, capability } });
      if (!existing) {
        await prisma.accessProfileCapability.create({ data: { accessProfileId: profile.id, capability } });
      }
    }
  }

  return profileIdByName;
}

async function seedPositionAccessAssignments(profileIdByName: Map<string, number>) {
  const positions = await prisma.positionProfile.findMany();

  for (const position of positions) {
    let assignments = explicitAssignments[position.title];

    if (!assignments && !NO_GRANTS_TITLES.has(position.title)) {
      if (position.level === 20) assignments = SHIFT_LEAD_ASSIGNMENTS;
      else if (position.level === 10 || position.level === 15) assignments = SELF_VIEW_ASSIGNMENTS;
    }

    if (!assignments) continue;

    for (const a of assignments) {
      const accessProfileId = profileIdByName.get(a.profileName);
      if (!accessProfileId) continue;

      const existing = await prisma.positionAccessAssignment.findFirst({
        where: { positionProfileId: position.id, accessProfileId, scope: a.scope },
      });
      if (!existing) {
        await prisma.positionAccessAssignment.create({ data: { positionProfileId: position.id, accessProfileId, scope: a.scope } });
      }
    }
  }
}

// Тестові облікові записи для перевірки автентифікації й доступу —
// імена й області з прототипу (prototype/hr-prototype-v3.jsx, масив ACTORS).
// Телефонів у прототипі немає — тестові номери й пароль лише для розробки.
const DEV_PASSWORD = "Test1234!";

type TestUserSeed = {
  phone: string;
  fullName: string;
  positionTitle: string;
  orgNodeCode: string;
  role?: Role;
};

const testUsers: TestUserSeed[] = [
  { phone: "+380500000001", fullName: "Петренко І.І.", positionTitle: "Адміністратор магазину", orgNodeCode: "SH01" },
  { phone: "+380500000002", fullName: "Гнатюк В.П.", positionTitle: "Директор кластера", orgNodeCode: "CLUSTER1" },
  { phone: "+380500000003", fullName: "Мороз С.В.", positionTitle: "Оператор 1С", orgNodeCode: "ONEC", role: Role.ONEC_ADMIN },
  { phone: "+380500000004", fullName: "Коваль О.П.", positionTitle: "Бухгалтер", orgNodeCode: "ACC", role: Role.ACCOUNTANT },
  { phone: "+380500000005", fullName: "Ткач Л.М.", positionTitle: "Бухгалтер-ревізор", orgNodeCode: "AUDIT", role: Role.AUDITOR },
  { phone: "+380500000006", fullName: "Савчук М.А.", positionTitle: "Фінансовий директор", orgNodeCode: "ADMIN", role: Role.COO },
  { phone: "+380500000007", fullName: "Гончар П.С.", positionTitle: "Системний адміністратор", orgNodeCode: "ONEC", role: Role.SYSADMIN },
];

async function seedTestUsers() {
  const root = await prisma.orgNode.findUniqueOrThrow({ where: { code: "ROOT" } });

  for (const u of testUsers) {
    const orgNode = await prisma.orgNode.findUniqueOrThrow({ where: { code: u.orgNodeCode } });
    const positionProfile = await prisma.positionProfile.findUniqueOrThrow({ where: { title: u.positionTitle } });

    const staffUnit = await prisma.staffUnit.upsert({
      where: { positionProfileId_orgNodeId: { positionProfileId: positionProfile.id, orgNodeId: orgNode.id } },
      update: {},
      create: { positionProfileId: positionProfile.id, orgNodeId: orgNode.id },
    });

    const person = await prisma.person.upsert({
      where: { phone: u.phone },
      update: {},
      create: { fullName: u.fullName, phone: u.phone, passwordHash: await hashPassword(DEV_PASSWORD) },
    });

    // За personId, не (personId, staffUnitId) — та сама причина, що й у
    // seedLineStaff нижче: не воскрешати стару штатну одиницю, якщо
    // реальний процес (переведення) уже змінив Employment.staffUnitId.
    let employment = await prisma.employment.findFirst({
      where: { personId: person.id },
    });
    if (!employment) {
      employment = await prisma.employment.create({
        data: {
          personId: person.id,
          staffUnitId: staffUnit.id,
          status: EmploymentStatus.ACTIVE,
          hiredAt: new Date(),
        },
      });
    }

    if (u.role) {
      await prisma.roleAssignment.upsert({
        where: {
          employmentId_role_orgNodeId: { employmentId: employment.id, role: u.role, orgNodeId: root.id },
        },
        update: {},
        create: { employmentId: employment.id, role: u.role, orgNodeId: root.id },
      });
    }
  }
}

// Керівники вузлів — потрібно для погоджувача переведення (docs v1.2 §2.1:
// "керівник найближчого спільного вузла рівня DIVISION"). Поле
// OrgNode.headEmploymentId існує з першої міграції, але досі не
// заповнювалось — беремо вже посаджених людей.
async function seedOrgHeads() {
  const gnatiuk = await prisma.person.findUnique({ where: { phone: "+380500000002" } });
  const savchuk = await prisma.person.findUnique({ where: { phone: "+380500000006" } });
  if (!gnatiuk || !savchuk) return;

  const gnatiukEmployment = await prisma.employment.findFirst({ where: { personId: gnatiuk.id } });
  const savchukEmployment = await prisma.employment.findFirst({ where: { personId: savchuk.id } });

  if (gnatiukEmployment) {
    await prisma.orgNode.update({ where: { code: "CLUSTER1" }, data: { headEmploymentId: gnatiukEmployment.id } });
  }
  if (savchukEmployment) {
    await prisma.orgNode.update({ where: { code: "ROOT" }, data: { headEmploymentId: savchukEmployment.id } });
  }
}

// Лінійний персонал — з prototype/hr-prototype-v3.jsx, масив `seed`.
// Пропущено: id=8 (у прототипі його теж немає), id=12 Кравець С.Р. —
// статус FROZEN, якого в EmploymentStatus ще нема (свідомо відкладено
// на крок «переведення/заморозка», див. пам'ять сесії). Розміщено на
// рівні об'єкта (SH01/TSEH/WH1), бо вузли-відділи (Каса/Гастрономія
// тощо) ми не сіяли — це спрощення, не з докс.
const COMPETENCY_CODE_BY_SHORT: Record<string, string> = {
  c1: "COMPANY_BASICS",
  c2: "LABOR_SAFETY",
  c3: "FIRE_SAFETY",
  c4: "SANITATION_HACCP",
  c5: "SERVICE_STANDARDS",
  c6: "CASHIER_PRRO",
  c7: "WEIGHED_GOODS_DATES",
  c8: "MATERIAL_LIABILITY",
  c9: "BAKING_TECHNOLOGY",
  c10: "BAKERY_EQUIPMENT",
  c11: "TRADE_RULES",
  c12: "ROAD_SAFETY",
};

type LineStaffSeed = {
  phone: string;
  fullName: string;
  birthDate: string; // dd.mm.yyyy
  positionTitle: string;
  orgNodeCode: string;
  status: EmploymentStatus;
  hiredAt: string; // dd.mm.yyyy
  terminatedAt?: string;
  recs: Record<string, string>; // короткий код компетенції -> yyyy-mm-dd
  reportsToShargorodAdmin?: boolean;
};

const lineStaff: LineStaffSeed[] = [
  { phone: "+380671234501", fullName: "Іваненко Іван Іванович", birthDate: "12.06.1998", positionTitle: "Касир", orgNodeCode: "SH01", status: EmploymentStatus.ACTIVE, hiredAt: "14.03.2025", reportsToShargorodAdmin: true, recs: { c1: "2025-03-20", c2: "2026-02-10", c3: "2026-02-10", c4: "2026-03-01", c5: "2025-03-25", c6: "2025-03-25", c7: "2025-03-25", c8: "2025-03-20" } },
  { phone: "+380671234502", fullName: "Гриценко Оксана Петрівна", birthDate: "03.02.2001", positionTitle: "Продавець", orgNodeCode: "SH01", status: EmploymentStatus.ACTIVE, hiredAt: "01.03.2026", reportsToShargorodAdmin: true, recs: { c1: "2026-03-05", c2: "2026-03-05", c3: "2026-03-05", c4: "2026-03-10", c5: "2026-03-12", c7: "2026-03-12", c8: "2026-03-05" } },
  { phone: "+380671234503", fullName: "Мельник Андрій Богданович", birthDate: "19.11.1994", positionTitle: "Пекар", orgNodeCode: "TSEH", status: EmploymentStatus.DOCUMENTS_PENDING, hiredAt: "04.09.2026", recs: {} },
  { phone: "+380671234504", fullName: "Костенко Марія Сергіївна", birthDate: "28.07.2003", positionTitle: "Касир", orgNodeCode: "SH01", status: EmploymentStatus.REGISTERED, hiredAt: "07.09.2026", reportsToShargorodAdmin: true, recs: {} },
  { phone: "+380671234505", fullName: "Демченко Юрій Олегович", birthDate: "05.05.1989", positionTitle: "Вантажник", orgNodeCode: "WH1", status: EmploymentStatus.ACTIVE, hiredAt: "22.01.2024", recs: { c1: "2024-01-25", c2: "2026-01-20", c3: "2026-01-20" } },
  { phone: "+380671234506", fullName: "Шевчук Олена Василівна", birthDate: "17.09.1990", positionTitle: "Старший касир", orgNodeCode: "SH01", status: EmploymentStatus.ACTIVE, hiredAt: "08.08.2022", reportsToShargorodAdmin: true, recs: { c1: "2022-08-15", c2: "2026-01-15", c3: "2026-01-15", c4: "2025-09-20", c5: "2025-02-10", c6: "2025-02-10", c7: "2025-02-10", c8: "2025-02-10", c11: "2026-04-02" } },
  { phone: "+380671234507", fullName: "Ткаченко Роман Ігорович", birthDate: "30.03.1996", positionTitle: "Касир", orgNodeCode: "SH01", status: EmploymentStatus.ACTIVE, hiredAt: "11.02.2025", reportsToShargorodAdmin: true, recs: { c1: "2025-02-15", c2: "2026-02-12", c3: "2026-02-12", c4: "2026-02-20", c5: "2025-02-18", c6: "2025-02-18", c7: "2025-02-18", c8: "2025-02-15" } },
  { phone: "+380671234509", fullName: "Романюк Дмитро Павлович", birthDate: "09.10.1999", positionTitle: "Оператор-тістоміс", orgNodeCode: "TSEH", status: EmploymentStatus.READY_FOR_ATTESTATION, hiredAt: "18.08.2026", recs: { c1: "2026-08-20", c2: "2026-08-20", c3: "2026-08-20", c4: "2026-08-25" } },
  { phone: "+380671234510", fullName: "Савченко Ірина Миколаївна", birthDate: "21.04.2000", positionTitle: "Працівник кулінарії", orgNodeCode: "SH01", status: EmploymentStatus.TRAINEE, hiredAt: "25.08.2026", reportsToShargorodAdmin: true, recs: { c1: "2026-08-28", c2: "2026-08-28" } },
  { phone: "+380671234511", fullName: "Поліщук Богдан Тарасович", birthDate: "02.02.1992", positionTitle: "Водій", orgNodeCode: "WH1", status: EmploymentStatus.ACTIVE, hiredAt: "07.07.2023", recs: { c1: "2023-07-10", c2: "2025-08-01", c3: "2025-08-01", c12: "2025-08-05" } },
  { phone: "+380671234513", fullName: "Захарчук Віталій Степанович", birthDate: "23.08.1995", positionTitle: "Касир", orgNodeCode: "SH01", status: EmploymentStatus.TERMINATED, hiredAt: "02.05.2024", terminatedAt: "10.04.2026", reportsToShargorodAdmin: true, recs: { c1: "2024-05-06", c2: "2026-01-10", c3: "2026-01-10", c4: "2026-01-15", c5: "2024-05-08", c6: "2024-05-08", c7: "2024-05-08", c8: "2024-05-06" } },
];

// Скільки одиниць заплановано на посаду у вузлі — щоб на екрані
// «Структура» був реалістичний план/факт (навмисно з розривом там,
// де в прототипі теж не все укомплектовано).
const plannedHeadcountByKey: Record<string, number> = {
  "Касир@SH01": 4,
  "Продавець@SH01": 1,
  "Старший касир@SH01": 1,
  "Працівник кулінарії@SH01": 1,
  "Пекар@TSEH": 2,
  "Оператор-тістоміс@TSEH": 1,
  "Вантажник@WH1": 2,
  "Водій@WH1": 1,
};

async function seedLineStaff() {
  const managerPerson = await prisma.person.findUnique({ where: { phone: "+380500000001" } });
  const managerEmployment = managerPerson
    ? await prisma.employment.findFirst({ where: { personId: managerPerson.id } })
    : null;

  for (const ls of lineStaff) {
    const orgNode = await prisma.orgNode.findUniqueOrThrow({ where: { code: ls.orgNodeCode } });
    const positionProfile = await prisma.positionProfile.findUniqueOrThrow({ where: { title: ls.positionTitle } });

    const key = `${ls.positionTitle}@${ls.orgNodeCode}`;
    const plannedHeadcount = plannedHeadcountByKey[key] ?? 1;

    const staffUnit = await prisma.staffUnit.upsert({
      where: { positionProfileId_orgNodeId: { positionProfileId: positionProfile.id, orgNodeId: orgNode.id } },
      update: {},
      create: { positionProfileId: positionProfile.id, orgNodeId: orgNode.id, plannedHeadcount },
    });

    const person = await prisma.person.upsert({
      where: { phone: ls.phone },
      update: {},
      create: { fullName: ls.fullName, phone: ls.phone, birthDate: parseUaDate(ls.birthDate) },
    });

    // Навмисно за personId, НЕ за (personId, staffUnitId): якщо людина вже
    // реально перевелась (staffUnitId змінився на самому Employment) чи
    // звільнилась через справжній процес, seed не повинен "воскрешати"
    // застарілу посаду з жорстко заданого рядка нижче — інакше кожен
    // повторний запуск seed після реального переведення створює дублікат
    // employment (сталось із Ткаченком Р.І., виправлено 2026-09-15).
    let employment = await prisma.employment.findFirst({
      where: { personId: person.id },
    });
    if (!employment) {
      employment = await prisma.employment.create({
        data: {
          personId: person.id,
          staffUnitId: staffUnit.id,
          status: ls.status,
          hiredAt: parseUaDate(ls.hiredAt),
          terminatedAt: ls.terminatedAt ? parseUaDate(ls.terminatedAt) : null,
          managerId: ls.reportsToShargorodAdmin ? managerEmployment?.id ?? null : null,
        },
      });
    }

    for (const [shortCode, passedAtStr] of Object.entries(ls.recs)) {
      const competencyCode = COMPETENCY_CODE_BY_SHORT[shortCode];
      const competency = await prisma.competency.findUnique({ where: { code: competencyCode } });
      if (!competency) continue;

      const existingRecord = await prisma.competencyRecord.findFirst({
        where: { personId: person.id, competencyId: competency.id },
      });
      if (existingRecord) continue;

      const passedAt = parseIsoDate(passedAtStr);
      const validUntil = competency.validMonths ? addMonthsUtc(passedAt, competency.validMonths) : null;

      await prisma.competencyRecord.create({
        data: { personId: person.id, competencyId: competency.id, passedAt, validUntil, source: CompetencySource.MANUAL },
      });
    }
  }
}

// Базовий чек-ліст онбордингу — docs/hr-system-catalogs-v1.1.md §6.1 (15
// пунктів) + модулі-надбудови §6.2. "responsibleRole" для модульних
// пунктів докс не задає явно (тільки для базових 15) — це моє обґрунтоване
// припущення за змістом пункту, не буквальна цитата.
type ChecklistItemSeed = {
  order: number;
  title: string;
  responsibleRole: Role | null;
  actionType: ActionType;
  isBlocking: boolean;
  slaHours: number | null;
  module: ChecklistModule | null;
  competencyCode?: string;
};

const baseChecklistItems: ChecklistItemSeed[] = [
  { order: 1, title: "Реєстрація по QR-коду", responsibleRole: Role.EMPLOYEE, actionType: ActionType.AUTO, isBlocking: true, slaHours: 0, module: null },
  { order: 2, title: "Згода на обробку персональних даних", responsibleRole: Role.EMPLOYEE, actionType: ActionType.MARK, isBlocking: true, slaHours: 24, module: null },
  { order: 3, title: "Заповнення профілю: посада, відділ, дата виходу", responsibleRole: Role.STORE_ADMIN, actionType: ActionType.INPUT_VALUE, isBlocking: true, slaHours: 24, module: null },
  { order: 4, title: "Призначення куратора", responsibleRole: Role.STORE_ADMIN, actionType: ActionType.INPUT_VALUE, isBlocking: true, slaHours: 24, module: null },
  { order: 5, title: "Реєстрація в 1С, генерація пароля", responsibleRole: Role.ONEC_ADMIN, actionType: ActionType.INPUT_VALUE, isBlocking: true, slaHours: 24, module: null },
  { order: 6, title: "Прийом і сканування документів", responsibleRole: Role.ACCOUNTANT, actionType: ActionType.UPLOAD, isBlocking: true, slaHours: 72, module: null },
  { order: 7, title: "Оформлення прийому (заява, наказ)", responsibleRole: Role.ACCOUNTANT, actionType: ActionType.MARK, isBlocking: true, slaHours: 72, module: null },
  // order 8, не серед модульних (правки 20.09.2026, п.9): виконує бухгалтер
  // одразу після оформлення прийому, поки людина ще в кабінеті — умовний
  // (module: MVO), як і решта модульних, просто не в діапазоні 100+.
  { order: 8, title: "Договір про матвідповідальність", responsibleRole: Role.ACCOUNTANT, actionType: ActionType.MARK, isBlocking: true, slaHours: 72, module: ChecklistModule.MVO },
  { order: 9, title: "Вступний інструктаж з охорони праці", responsibleRole: Role.STORE_ADMIN, actionType: ActionType.MARK, isBlocking: true, slaHours: 24, module: null },
  { order: 10, title: "Інструктаж з пожежної безпеки", responsibleRole: Role.STORE_ADMIN, actionType: ActionType.MARK, isBlocking: true, slaHours: 24, module: null },
  { order: 11, title: "Видача бейджа, спецодягу, ключів", responsibleRole: Role.STORE_ADMIN, actionType: ActionType.MARK, isBlocking: false, slaHours: 72, module: null },
  { order: 12, title: "Надсилання welcomebook і матеріалів LMS", responsibleRole: null, actionType: ActionType.AUTO, isBlocking: true, slaHours: 0, module: null },
  { order: 13, title: "Знайомство з колективом і робочим місцем", responsibleRole: Role.STORE_ADMIN, actionType: ActionType.MARK, isBlocking: false, slaHours: 48, module: null },
  { order: 14, title: "Ознайомлення з обов'язковими матеріалами", responsibleRole: Role.EMPLOYEE, actionType: ActionType.MARK, isBlocking: true, slaHours: 168, module: null },
  { order: 15, title: "Стажування під наглядом куратора", responsibleRole: Role.CURATOR, actionType: ActionType.MARK, isBlocking: true, slaHours: 336, module: null },
  // order 200, не 15: модульні пункти (order 100-182 нижче) мають бути пройдені
  // ДО фінальної атестації, а не навпаки — послідовне блокування рахує єдиний
  // ланцюжок по order через усі пункти інстансу, тож атестація має йти
  // останньою в усьому чек-листі, а не одразу після базових 14 пунктів.
  { order: 200, title: "Атестація", responsibleRole: Role.STORE_ADMIN, actionType: ActionType.APPROVAL, isBlocking: true, slaHours: 72, module: null },
];

const moduleChecklistItems: ChecklistItemSeed[] = [
  // Правки 20.09.2026, п.11 (розібрано з користувачем 2026-09-25): прибрано
  // "Навчання роботі з ПРРО й поверненнями"/"Інструктаж з інкасації" —
  // прості MARK-галочки без зв'язку з компетенцією, зайва бюрократія.
  // "Реєстрація на касовому апараті" (доступ до каси) посунута ПІСЛЯ
  // атестації (order 201, атестація — order 200) — з міркувань безпеки:
  // доступ до каси лише після підтвердженої компетентності, не на старті
  // модуля. "Тест «Каса»" лишено як є — єдиний пункт із реальним
  // оцінюванням (бал 0-100), на відміну від MARK.
  { order: 103, title: "Тест «Каса»", responsibleRole: Role.EMPLOYEE, actionType: ActionType.TEST, isBlocking: true, slaHours: 168, module: ChecklistModule.CASHIER, competencyCode: "CASHIER_PRRO" },
  { order: 201, title: "Реєстрація на касовому апараті", responsibleRole: Role.ONEC_ADMIN, actionType: ActionType.MARK, isBlocking: true, slaHours: 24, module: ChecklistModule.CASHIER },

  { order: 111, title: "Прийом-передача ТМЦ", responsibleRole: Role.STORE_ADMIN, actionType: ActionType.MARK, isBlocking: true, slaHours: 72, module: ChecklistModule.MVO },
  { order: 112, title: "Ознайомлення з порядком інвентаризації", responsibleRole: Role.STORE_ADMIN, actionType: ActionType.MARK, isBlocking: false, slaHours: 72, module: ChecklistModule.MVO },

  // Правки 20.09.2026, п.11: "Інструктаж з санітарії та HACCP" прибрано —
  // дублює тест 124 і матеріал компетенції SANITATION_HACCP, сам нічого
  // не записує (той самий випадок, що й 101/102 у касира).
  { order: 120, title: "Медкнижка з чинними відмітками", responsibleRole: Role.ACCOUNTANT, actionType: ActionType.UPLOAD, isBlocking: true, slaHours: 72, module: ChecklistModule.FOOD },
  { order: 122, title: "Правила особистої гігієни", responsibleRole: Role.STORE_ADMIN, actionType: ActionType.MARK, isBlocking: false, slaHours: 24, module: ChecklistModule.FOOD },
  { order: 123, title: "Видача санітарного одягу", responsibleRole: Role.STORE_ADMIN, actionType: ActionType.MARK, isBlocking: false, slaHours: 72, module: ChecklistModule.FOOD },
  { order: 124, title: "Тест «Санітарія»", responsibleRole: Role.EMPLOYEE, actionType: ActionType.TEST, isBlocking: true, slaHours: 168, module: ChecklistModule.FOOD, competencyCode: "SANITATION_HACCP" },

  { order: 130, title: "Стандарти обслуговування", responsibleRole: Role.CURATOR, actionType: ActionType.MARK, isBlocking: true, slaHours: 168, module: ChecklistModule.RETAIL },
  { order: 131, title: "Робота з ваговим товаром", responsibleRole: Role.CURATOR, actionType: ActionType.MARK, isBlocking: true, slaHours: 168, module: ChecklistModule.RETAIL },
  { order: 132, title: "Викладка й планограми", responsibleRole: Role.CURATOR, actionType: ActionType.MARK, isBlocking: false, slaHours: 168, module: ChecklistModule.RETAIL },
  { order: 133, title: "Робота з термінами придатності", responsibleRole: Role.CURATOR, actionType: ActionType.MARK, isBlocking: true, slaHours: 168, module: ChecklistModule.RETAIL },
  { order: 134, title: "Тест «Стандарти»", responsibleRole: Role.EMPLOYEE, actionType: ActionType.TEST, isBlocking: true, slaHours: 168, module: ChecklistModule.RETAIL, competencyCode: "SERVICE_STANDARDS" },

  { order: 140, title: "Правила приймання товару", responsibleRole: Role.STORE_ADMIN, actionType: ActionType.MARK, isBlocking: true, slaHours: 72, module: ChecklistModule.WAREHOUSE },
  { order: 141, title: "Робота зі складською технікою", responsibleRole: Role.CURATOR, actionType: ActionType.MARK, isBlocking: true, slaHours: 72, module: ChecklistModule.WAREHOUSE },
  { order: 142, title: "Схема зон зберігання", responsibleRole: Role.STORE_ADMIN, actionType: ActionType.MARK, isBlocking: false, slaHours: 72, module: ChecklistModule.WAREHOUSE },

  { order: 150, title: "Посвідчення й медсправка", responsibleRole: Role.ACCOUNTANT, actionType: ActionType.UPLOAD, isBlocking: true, slaHours: 72, module: ChecklistModule.TRANSPORT },
  { order: 151, title: "Інструктаж з БДР", responsibleRole: Role.STORE_ADMIN, actionType: ActionType.MARK, isBlocking: true, slaHours: 24, module: ChecklistModule.TRANSPORT },
  { order: 152, title: "Порядок оформлення ТТН", responsibleRole: Role.STORE_ADMIN, actionType: ActionType.MARK, isBlocking: true, slaHours: 72, module: ChecklistModule.TRANSPORT },
  { order: 153, title: "Закріплення автомобіля", responsibleRole: Role.STORE_ADMIN, actionType: ActionType.MARK, isBlocking: false, slaHours: 72, module: ChecklistModule.TRANSPORT },

  { order: 160, title: "Довідка про несудимість", responsibleRole: Role.ACCOUNTANT, actionType: ActionType.UPLOAD, isBlocking: true, slaHours: 72, module: ChecklistModule.SECURITY },
  { order: 161, title: "Інструкція з реагування на інциденти", responsibleRole: Role.STORE_ADMIN, actionType: ActionType.MARK, isBlocking: true, slaHours: 24, module: ChecklistModule.SECURITY },
  { order: 162, title: "Порядок затримання й виклику поліції", responsibleRole: Role.STORE_ADMIN, actionType: ActionType.MARK, isBlocking: true, slaHours: 24, module: ChecklistModule.SECURITY },

  { order: 170, title: "Доступ до системи (логін і пароль)", responsibleRole: Role.SYSADMIN, actionType: ActionType.MARK, isBlocking: true, slaHours: 24, module: ChecklistModule.MANAGEMENT },
  { order: 171, title: "Навчання роботі в системі", responsibleRole: Role.SYSADMIN, actionType: ActionType.MARK, isBlocking: true, slaHours: 48, module: ChecklistModule.MANAGEMENT },
  { order: 172, title: "Ознайомлення з бюджетом і KPI об'єкта", responsibleRole: Role.COO, actionType: ActionType.MARK, isBlocking: false, slaHours: 72, module: ChecklistModule.MANAGEMENT },
  { order: 173, title: "Передача печатки/ключів сейфа", responsibleRole: Role.STORE_ADMIN, actionType: ActionType.MARK, isBlocking: false, slaHours: 24, module: ChecklistModule.MANAGEMENT },

  { order: 180, title: "Доступ до системи", responsibleRole: Role.SYSADMIN, actionType: ActionType.MARK, isBlocking: true, slaHours: 24, module: ChecklistModule.OFFICE },
  { order: 181, title: "Робоче місце й техніка", responsibleRole: Role.ACCOUNTANT, actionType: ActionType.MARK, isBlocking: false, slaHours: 24, module: ChecklistModule.OFFICE },
  { order: 182, title: "Ознайомлення з регламентами відділу", responsibleRole: Role.ACCOUNTANT, actionType: ActionType.MARK, isBlocking: false, slaHours: 48, module: ChecklistModule.OFFICE },
];

/**
 * Версіонування за фактичним найновішим рядком у базі, не за жорстко
 * зашитим номером (правки 20.09.2026, п.11 — тут виявлено, що
 * ONBOARDING_BASE вже мав версії аж до v3 з попередньої, недокументованої
 * сесії; перевірка "чи є вже v2" тому мовчки нічого не робила). Порівнює
 * бажаний фінальний список пунктів із пунктами найновішої версії — якщо
 * збігається, нова версія не потрібна (ідемпотентно); якщо ні — деактивує
 * найновішу й створює наступну.
 */
async function seedOnboardingTemplate() {
  const desiredItems = [...baseChecklistItems, ...moduleChecklistItems];

  const existingVersions = await prisma.processTemplate.findMany({
    where: { code: "ONBOARDING_BASE" },
    include: { items: true },
    orderBy: { version: "desc" },
  });

  if (!existingVersions.length) {
    const template = await prisma.processTemplate.create({
      data: { code: "ONBOARDING_BASE", version: 1, type: ProcessType.ONBOARDING, name: "Онбординг — базовий трек" },
    });
    await createOnboardingItems(template.id);
    return;
  }

  const current = existingVersions[0];
  const matches =
    current.items.length === desiredItems.length &&
    desiredItems.every((d) =>
      current.items.some((i) => i.order === d.order && i.title === d.title && i.isBlocking === d.isBlocking && i.actionType === d.actionType),
    );
  if (matches) return;

  if (current.isActive) {
    await prisma.processTemplate.update({ where: { id: current.id }, data: { isActive: false } });
  }
  const next = await prisma.processTemplate.create({
    data: { code: "ONBOARDING_BASE", version: current.version + 1, type: ProcessType.ONBOARDING, name: "Онбординг — базовий трек" },
  });
  await createOnboardingItems(next.id);
}

async function createOnboardingItems(templateId: number) {
  for (const item of [...baseChecklistItems, ...moduleChecklistItems]) {
    const competency = item.competencyCode
      ? await prisma.competency.findUniqueOrThrow({ where: { code: item.competencyCode } })
      : null;
    await prisma.checklistItemTemplate.create({
      data: {
        templateId,
        order: item.order,
        title: item.title,
        responsibleRole: item.responsibleRole,
        actionType: item.actionType,
        isBlocking: item.isBlocking,
        slaHours: item.slaHours,
        module: item.module,
        competencyId: competency?.id,
      },
    });
  }
}

// Довідник приводів позитив/негатив — docs/hr-rating-visibility-v1.3.md §2.1.
type RatingCategorySeed = { code: string; name: string; side: RatingSide; defaultPoints: number };

const ratingCategories: RatingCategorySeed[] = [
  { code: "merch", name: "Викладка й порядок", side: RatingSide.POS, defaultPoints: 5 },
  { code: "service", name: "Обслуговування клієнта", side: RatingSide.POS, defaultPoints: 5 },
  { code: "speed", name: "Швидкість і темп", side: RatingSide.POS, defaultPoints: 5 },
  { code: "sanitary", name: "Санітарія і чистота", side: RatingSide.POS, defaultPoints: 5 },
  { code: "initiative", name: "Ініціатива", side: RatingSide.POS, defaultPoints: 8 },
  { code: "help", name: "Підміна, виручив зміну", side: RatingSide.POS, defaultPoints: 8 },
  { code: "late", name: "Запізнення", side: RatingSide.NEG, defaultPoints: -5 },
  { code: "standard", name: "Порушення стандарту", side: RatingSide.NEG, defaultPoints: -5 },
  { code: "cash_err", name: "Помилка на касі", side: RatingSide.NEG, defaultPoints: -8 },
  { code: "sanitary_n", name: "Санітарія", side: RatingSide.NEG, defaultPoints: -8 },
  { code: "equip_n", name: "Недбале ставлення до обладнання", side: RatingSide.NEG, defaultPoints: -8 },
  { code: "conflict", name: "Конфлікт з клієнтом", side: RatingSide.NEG, defaultPoints: -10 },
];

async function seedRatingCategories() {
  for (const c of ratingCategories) {
    await prisma.ratingCategory.upsert({
      where: { code: c.code },
      update: { name: c.name, side: c.side, defaultPoints: c.defaultPoints },
      create: { code: c.code, name: c.name, side: c.side, defaultPoints: c.defaultPoints },
    });
  }
}

// Каталог бейджів — docs v1.3 §3.1 (автоматичні) і §3.2 (номінації).
// Реально рахуються (lib/rating.ts, тригер у lib/onboarding.ts::completeTask
// після кожного CompetencyRecord): "profile_closed", "beyond_profile",
// "fast_start", "mentor". Решта 3 (clean_streak/always_current/tenure) —
// періодичні, не подієві, потребують pg-boss (свідома прогалина).
type BadgeSeed = { code: string; name: string; description: string; isAuto: boolean };

const badgeSeeds: BadgeSeed[] = [
  { code: "profile_closed", name: "Профіль закрито", description: "Усі компетенції посади чинні", isAuto: true },
  { code: "beyond_profile", name: "Понад профіль", description: "Складено бонусні компетенції", isAuto: true },
  { code: "fast_start", name: "Швидкий старт", description: "Атестація з першого разу", isAuto: true },
  { code: "mentor", name: "Наставник", description: "Троє стажерів склали атестацію з першого разу", isAuto: true },
  { code: "clean_streak", name: "Без зауважень", description: "Півроку без негативних відміток", isAuto: true },
  { code: "always_current", name: "Завжди в строю", description: "Рік без жодного протермінованого документа чи компетенції", isAuto: true },
  { code: "tenure", name: "Стаж", description: "За датою прийому, з урахуванням перерв", isAuto: true },
  { code: "best_display", name: "Найкраща викладка місяця", description: "Номінація керівництва", isAuto: false },
  { code: "initiative_quarter", name: "Ініціатива кварталу", description: "Номінація керівництва", isAuto: false },
  { code: "shift_saver", name: "Порятунок зміни", description: "Номінація керівництва", isAuto: false },
  { code: "client_voice", name: "Голос клієнта", description: "Подяка від покупця", isAuto: false },
  { code: "clean_workshop", name: "Чистий цех", description: "Номінація керівництва", isAuto: false },
];

async function seedBadges() {
  for (const b of badgeSeeds) {
    await prisma.badge.upsert({
      where: { code: b.code },
      update: { name: b.name, description: b.description, isAuto: b.isAuto },
      create: { code: b.code, name: b.name, description: b.description, isAuto: b.isAuto },
    });
  }
}

// Довідник причин заморозки — docs v1.2 §3 (приклади в тексті, не таблиця).
const freezeReasons: { code: string; name: string }[] = [
  { code: "MATERNITY", name: "Декрет" },
  { code: "MOBILIZATION", name: "Мобілізація" },
  { code: "LONG_TREATMENT", name: "Тривале лікування" },
  { code: "STUDY", name: "Навчання" },
  { code: "SEASONAL_BREAK", name: "Сезонна перерва" },
];

async function seedFreezeReasons() {
  for (const r of freezeReasons) {
    await prisma.freezeReason.upsert({
      where: { code: r.code },
      update: { name: r.name },
      create: { code: r.code, name: r.name },
    });
  }
}

// Чек-ліст переведення — docs v1.2 §2.2, 9 пунктів. Пункти 3 (ТМЦ) і
// 6-7 (дельта-навчання/атестація) підключаються умовно при створенні
// інстансу (lib/transfer.ts), не тут — залежать від конкретного переведення,
// не від шаблону.
const transferChecklistItems: ChecklistItemSeed[] = [
  { order: 1, title: "Ініціація: нове місце, посада, дата", responsibleRole: null, actionType: ActionType.AUTO, isBlocking: true, slaHours: 0, module: null },
  { order: 2, title: "Погодження переведення", responsibleRole: null, actionType: ActionType.APPROVAL, isBlocking: true, slaHours: 48, module: null },
  { order: 3, title: "Передача ТМЦ і зняття обладнання", responsibleRole: Role.AUDITOR, actionType: ActionType.MARK, isBlocking: true, slaHours: 72, module: null },
  { order: 4, title: "Зміна доступів у 1С і на касі", responsibleRole: Role.ONEC_ADMIN, actionType: ActionType.MARK, isBlocking: true, slaHours: 24, module: null },
  { order: 5, title: "Кадрове оформлення переведення", responsibleRole: Role.ACCOUNTANT, actionType: ActionType.MARK, isBlocking: true, slaHours: 48, module: null },
  { order: 6, title: "Дельта-навчання за новим профілем", responsibleRole: Role.CURATOR, actionType: ActionType.MARK, isBlocking: true, slaHours: 168, module: null },
  { order: 7, title: "Атестація за новим профілем", responsibleRole: Role.STORE_ADMIN, actionType: ActionType.APPROVAL, isBlocking: true, slaHours: 72, module: null },
  { order: 8, title: "Закріплення обладнання на новому місці", responsibleRole: Role.STORE_ADMIN, actionType: ActionType.MARK, isBlocking: false, slaHours: 48, module: null },
  { order: 9, title: "Оновлення штатного розпису обох вузлів", responsibleRole: null, actionType: ActionType.AUTO, isBlocking: true, slaHours: 0, module: null },
];

async function seedTransferTemplate() {
  const existing = await prisma.processTemplate.findUnique({
    where: { code_version: { code: "TRANSFER_BASE", version: 1 } },
  });
  if (existing) return;

  const template = await prisma.processTemplate.create({
    data: { code: "TRANSFER_BASE", version: 1, type: ProcessType.TRANSFER, name: "Переведення — базовий чек-ліст" },
  });

  for (const item of transferChecklistItems) {
    await prisma.checklistItemTemplate.create({
      data: {
        templateId: template.id,
        order: item.order,
        title: item.title,
        responsibleRole: item.responsibleRole,
        actionType: item.actionType,
        isBlocking: item.isBlocking,
        slaHours: item.slaHours,
        module: item.module,
      },
    });
  }
}

// Довідник причин звільнення — docs v1.1 §10 каже "з довідника", але не
// дає переліку (на відміну від причин заморозки). Стартовий список склав
// сам за практикою роздрібу — не з докс, підлягає уточненню з бухгалтером.
const terminationReasons: { code: string; name: string }[] = [
  { code: "OWN_WISH", name: "За власним бажанням" },
  { code: "MUTUAL_AGREEMENT", name: "За угодою сторін" },
  { code: "EMPLOYER_INITIATIVE", name: "За ініціативою роботодавця" },
  { code: "PROBATION_FAILED", name: "Звільнення на випробувальному терміні" },
  { code: "ABSENTEEISM", name: "Прогул" },
];

async function seedTerminationReasons() {
  for (const r of terminationReasons) {
    await prisma.terminationReason.upsert({
      where: { code: r.code },
      update: { name: r.name },
      create: { code: r.code, name: r.name },
    });
  }
}

// Чек-ліст звільнення — docs/hr-system-catalogs-v1.1.md §8.1, 16 пунктів.
// Пункт 7 (ТМЦ) — умовний, підключається лише для МВО-профілів (lib/termination.ts).
// Пункти 9/10 — блокуючі для ВСІХ (правки 20.09.2026, п.12; рішення
// узгоджено з користувачем 2026-09-22, див. project_decisions) — свідома
// відмова від докс-умови "блокує лише для рівня ≥ 20" на користь простішого
// правила. Це друга версія шаблону (v2 нижче в seedOffboardingTemplate) —
// v1 лишається як була, щоб не зачепити вже запущені звільнення.
const terminationChecklistItems: ChecklistItemSeed[] = [
  { order: 1, title: "Ініціація: причина, останній робочий день", responsibleRole: Role.STORE_ADMIN, actionType: ActionType.INPUT_VALUE, isBlocking: true, slaHours: 0, module: null },
  { order: 2, title: "Заява на звільнення прийнята", responsibleRole: Role.ACCOUNTANT, actionType: ActionType.UPLOAD, isBlocking: true, slaHours: 24, module: null },
  { order: 3, title: "Блокування облікових записів 1С", responsibleRole: Role.ONEC_ADMIN, actionType: ActionType.MARK, isBlocking: true, slaHours: 4, module: null },
  { order: 4, title: "Зняття доступу до каси й ПРРО", responsibleRole: Role.ONEC_ADMIN, actionType: ActionType.MARK, isBlocking: true, slaHours: 4, module: null },
  { order: 5, title: "Блокування доступу до системи", responsibleRole: null, actionType: ActionType.AUTO, isBlocking: true, slaHours: 0, module: null },
  { order: 6, title: "Квитування закріпленого обладнання", responsibleRole: Role.AUDITOR, actionType: ActionType.MARK, isBlocking: true, slaHours: 48, module: null },
  { order: 7, title: "Інвентаризація та передача ТМЦ", responsibleRole: Role.AUDITOR, actionType: ActionType.MARK, isBlocking: true, slaHours: 72, module: null },
  { order: 8, title: "Повернення бейджа, ключів, спецодягу, форми", responsibleRole: Role.STORE_ADMIN, actionType: ActionType.MARK, isBlocking: true, slaHours: 24, module: null },
  { order: 9, title: "Повернення техніки", responsibleRole: Role.STORE_ADMIN, actionType: ActionType.MARK, isBlocking: true, slaHours: 24, module: null },
  { order: 10, title: "Передача справ наступнику або куратору", responsibleRole: Role.STORE_ADMIN, actionType: ActionType.MARK, isBlocking: true, slaHours: 48, module: null },
  { order: 11, title: "Відмітка про наявність/відсутність претензій", responsibleRole: Role.AUDITOR, actionType: ActionType.APPROVAL, isBlocking: true, slaHours: 0, module: null },
  { order: 12, title: "Погодження звільнення", responsibleRole: Role.COO, actionType: ActionType.APPROVAL, isBlocking: true, slaHours: 24, module: null },
  { order: 13, title: "Оформлення звільнення", responsibleRole: Role.ACCOUNTANT, actionType: ActionType.MARK, isBlocking: true, slaHours: 0, module: null },
  { order: 14, title: "Друк і підписання листа узгодження", responsibleRole: Role.ACCOUNTANT, actionType: ActionType.PRINT, isBlocking: true, slaHours: 0, module: null },
  { order: 15, title: "Вихідне інтерв'ю", responsibleRole: Role.STORE_ADMIN, actionType: ActionType.INPUT_VALUE, isBlocking: false, slaHours: 168, module: null },
  { order: 16, title: "Архівація профілю, статус TERMINATED", responsibleRole: null, actionType: ActionType.AUTO, isBlocking: true, slaHours: 0, module: null },
];

/** Те саме версіонування за фактичною найновішою версією, що й seedOnboardingTemplate вище. */
async function seedOffboardingTemplate() {
  const existingVersions = await prisma.processTemplate.findMany({
    where: { code: "OFFBOARDING_BASE" },
    include: { items: true },
    orderBy: { version: "desc" },
  });

  if (!existingVersions.length) {
    const template = await prisma.processTemplate.create({
      data: { code: "OFFBOARDING_BASE", version: 1, type: ProcessType.OFFBOARDING, name: "Звільнення — базовий чек-ліст" },
    });
    await createOffboardingItems(template.id);
    return;
  }

  const current = existingVersions[0];
  const matches =
    current.items.length === terminationChecklistItems.length &&
    terminationChecklistItems.every((d) =>
      current.items.some((i) => i.order === d.order && i.title === d.title && i.isBlocking === d.isBlocking && i.actionType === d.actionType),
    );
  if (matches) return;

  if (current.isActive) {
    await prisma.processTemplate.update({ where: { id: current.id }, data: { isActive: false } });
  }
  const next = await prisma.processTemplate.create({
    data: { code: "OFFBOARDING_BASE", version: current.version + 1, type: ProcessType.OFFBOARDING, name: "Звільнення — базовий чек-ліст" },
  });
  await createOffboardingItems(next.id);
}

async function createOffboardingItems(templateId: number) {
  for (const item of terminationChecklistItems) {
    await prisma.checklistItemTemplate.create({
      data: {
        templateId,
        order: item.order,
        title: item.title,
        responsibleRole: item.responsibleRole,
        actionType: item.actionType,
        isBlocking: item.isBlocking,
        slaHours: item.slaHours,
        module: item.module,
      },
    });
  }
}

// Довідник типів документів — docs/hr-system-catalogs-v1.1.md §5.1.
// retentionMonths = 12 скрізь — docs/hr-system-plan-v1.md §14: "скани
// документів — 12 місяців після звільнення" (загальне правило, не по типах).
type DocumentTypeSeed = { code: string; name: string; hasExpiry?: boolean; reminderDaysBefore?: number };

const documentTypes: DocumentTypeSeed[] = [
  { code: "PASSPORT", name: "Паспорт / ID-картка" },
  { code: "TAX_ID", name: "РНОКПП (ІПН)" },
  { code: "EMPLOYMENT_RECORD", name: "Трудова книжка або відомості з реєстру" },
  { code: "MILITARY_DOC", name: "Військово-обліковий документ", hasExpiry: true, reminderDaysBefore: 30 },
  { code: "MED_BOOK", name: "Особиста медична (санітарна) книжка", hasExpiry: true, reminderDaysBefore: 30 },
  { code: "BANK_DETAILS", name: "Реквізити картки для зарплати" },
  { code: "PHOTO", name: "Фото для бейджа" },
  { code: "PDP_CONSENT", name: "Згода на обробку персональних даних" },
  { code: "LIABILITY_AGREEMENT", name: "Договір про повну матеріальну відповідальність" },
  { code: "CRIMINAL_RECORD", name: "Довідка про несудимість", hasExpiry: true, reminderDaysBefore: 30 },
  { code: "DRIVER_LICENSE", name: "Посвідчення водія", hasExpiry: true, reminderDaysBefore: 60 },
  { code: "DRIVER_MED", name: "Медична довідка водія", hasExpiry: true, reminderDaysBefore: 30 },
  { code: "DIPLOMA", name: "Диплом / свідоцтво про освіту" },
  { code: "CERTIFICATE", name: "Профільний сертифікат", hasExpiry: true, reminderDaysBefore: 30 },
  { code: "SECURITY_CERT", name: "Посвідчення охоронника", hasExpiry: true, reminderDaysBefore: 30 },
];

async function seedDocumentTypes() {
  for (const dt of documentTypes) {
    await prisma.documentType.upsert({
      where: { code: dt.code },
      update: { name: dt.name, hasExpiry: dt.hasExpiry ?? false, reminderDaysBefore: dt.reminderDaysBefore, retentionMonths: 12 },
      create: {
        code: dt.code,
        name: dt.name,
        hasExpiry: dt.hasExpiry ?? false,
        reminderDaysBefore: dt.reminderDaysBefore,
        retentionMonths: 12,
      },
    });
  }
}

// Кілька прикладів обладнання — з прототипу (об'єкт EQUIPMENT), закріплені
// за реальними тестовими працівниками для демонстрації, не з докс-таблиці.
const equipmentSeeds: { inventoryNo: string; name: string; orgNodeCode: string; responsiblePhone?: string }[] = [
  { inventoryNo: "00147", name: "ТЗД Zebra MC330", orgNodeCode: "SH01", responsiblePhone: "+380671234501" },
  { inventoryNo: "00312", name: "Ключ від каси №2", orgNodeCode: "SH01", responsiblePhone: "+380671234501" },
  { inventoryNo: "00088", name: "Ваги Digi SM-100", orgNodeCode: "SH01" },
  { inventoryNo: "00455", name: "Планшет Lenovo M10", orgNodeCode: "WH1", responsiblePhone: "+380671234511" },
];

async function seedEquipment() {
  for (const eq of equipmentSeeds) {
    const orgNode = await prisma.orgNode.findUniqueOrThrow({ where: { code: eq.orgNodeCode } });
    let responsibleId: number | null = null;
    if (eq.responsiblePhone) {
      const person = await prisma.person.findUnique({ where: { phone: eq.responsiblePhone } });
      if (person) {
        const employment = await prisma.employment.findFirst({ where: { personId: person.id } });
        responsibleId = employment?.id ?? null;
      }
    }

    await prisma.equipment.upsert({
      where: { inventoryNo: eq.inventoryNo },
      update: {},
      create: {
        inventoryNo: eq.inventoryNo,
        name: eq.name,
        orgNodeId: orgNode.id,
        responsibleId,
        assignedAt: responsibleId ? new Date() : null,
      },
    });
  }
}

// Тексти сповіщень (docs plan-v1.md §8: "Шаблони повідомлень — у БД, не в
// коді"). Ключ — стабільний ідентифікатор з коду. `{{плейсхолдери}}`
// підставляються в lib/notificationTemplates.ts::sendNotification.
const notificationTemplates: { key: string; description: string; text: string }[] = [
  {
    key: "onboarding.employeeMarkTaskReminder",
    description: "Нагадування працівнику виконати пункт чек-ліста (кнопка «Виконано»)",
    text: "Потрібна ваша дія: «{{taskTitle}}».",
  },
  {
    key: "onboarding.welcomeMaterials",
    description: "Привітання з переліком навчальних матеріалів на старті онбордингу",
    text: "Ласкаво просимо! Ваші навчальні матеріали для початку роботи:\n\n{{materialsList}}",
  },
  {
    key: "onboarding.profileActivated",
    description: "Активація профілю — дані для входу в кабінет",
    text: "Ваш профіль активовано. Зверніться до оператора 1С і бухгалтерії для оформлення.\n\nДані для входу в особистий кабінет (профіль, матеріали, прогрес навчання):\nТелефон: {{phone}}\nПароль: {{password}}",
  },
  {
    key: "onboarding.onecTaskAssigned",
    description: "Оператору 1С — нова задача реєстрації",
    text: "Нова задача: реєстрація в 1С для {{fullName}}.",
  },
  {
    key: "onboarding.accountantTaskAssigned",
    description: "Бухгалтеру — нова задача прийому документів",
    text: "Нова задача: прийом документів для {{fullName}}.",
  },
  {
    key: "onboarding.paperworkDoneAdmin",
    description: "Адміністратору об'єкта — оформлення прийому завершено",
    text: "Оформлення {{fullName}} завершено — можна розпочинати навчання.",
  },
  {
    key: "onboarding.paperworkDoneCurator",
    description: "Куратору — оформлення прийому завершено",
    text: "Оформлення {{fullName}} завершено — можна розпочинати стажування.",
  },
  {
    key: "onboarding.internshipDoneConfirmPrompt",
    description: "Працівнику — підтвердити готовність до атестації (кнопка)",
    text: "Стажування завершено. Якщо готові складати атестацію — підтвердіть.",
  },
  {
    key: "onboarding.readyForAttestationAdmin",
    description: "Адміністратору об'єкта — працівник готовий до атестації",
    text: "{{fullName}} готовий(-а) до атестації.",
  },
  {
    key: "onboarding.materialsAcknowledgeRequest",
    description: "Стажеру — список обов'язкових матеріалів + кнопка підтвердження ознайомлення",
    text: "Матеріали для ознайомлення:\n\n{{materialsList}}\n\nПісля вивчення натисніть «Ознайомлений(а)».",
  },
  {
    key: "onboarding.curatorAssigned",
    description: "Куратору — призначено нового підопічного",
    text: "У вас новий підопічний: {{fullName}} ({{positionTitle}}). Чек-ліст онбордингу — в системі.",
  },
  {
    key: "onboarding.traineeNotifiedOfCurator",
    description: "Стажеру — призначено куратора",
    text: "Ваш куратор на час навчання: {{curatorName}}. З усіх питань по стажуванню звертайтесь до нього/неї.",
  },
  {
    key: "sla.overdueReminder",
    description: "Виконавцю — пункт чек-ліста протерміновано",
    text: "Протерміновано: «{{taskTitle}}». Норматив минув {{dueAt}}.",
  },
  {
    key: "sla.escalation",
    description: "Керівнику вузла — ескалація протермінованого пункту понад добу",
    text: "Ескалація: «{{taskTitle}}» для {{fullName}} протерміновано понад добу.",
  },
  {
    key: "vacation.newRequest",
    description: "Погоджувачу — нова заявка на відпустку",
    text: "Заявка на відпустку: {{fullName}}, {{type}}, {{period}}.{{note}}\n\nПогодьте або відхиліть у системі.",
  },
  {
    key: "vacation.approved",
    description: "Працівнику — заявку на відпустку погоджено",
    text: "Вашу заявку на відпустку ({{period}}) погоджено.",
  },
  {
    key: "vacation.rejected",
    description: "Працівнику — заявку на відпустку відхилено",
    text: "Вашу заявку на відпустку ({{period}}) відхилено.{{reasonSuffix}}",
  },
  {
    key: "review.newQuarterlyReview",
    description: "Працівнику — нова квартальна оцінка готова до ознайомлення",
    text: "У вас квартальна оцінка за {{quarter}} квартал {{year}}. Обговоріть її з керівником, якщо ще не встигли, і підтвердьте ознайомлення нижче.",
  },
  {
    key: "attestation.failedCurator",
    description: "Куратору — атестація підопічного не складена",
    text: "Атестація {{fullName}} не складена (спроба {{attemptNumber}}).\n\nНе зараховано: {{missing}}.",
  },
  {
    key: "attestation.thirdFailEscalation",
    description: "Директору кластера — третій провал атестації поспіль",
    text: "{{fullName}} провалив(-ла) атестацію втретє. Не зараховано: {{missing}}. Потрібне рішення.",
  },
  {
    key: "bot.newHireRequest",
    description: "Адміністратору об'єкта — нова заявка на реєстрацію через QR",
    text: "Нова заявка на реєстрацію: {{fullName}} ({{objectName}}). Перевірте розділ «Нові заявки» в системі.",
  },
  {
    key: "auth.loginConfirmation",
    description: "Підтвердження входу через 2FA (кнопка)",
    text: "Вхід у систему для {{fullName}}. Якщо це ви — підтвердіть кнопкою нижче.",
  },
  {
    key: "auth.cabinetPasswordReset",
    description: "Новий пароль кабінету після скидання (боту або адміном)",
    text: "Ваш новий пароль до кабінету: {{password}}. Попередній більше не діє. Якщо це були не ви — негайно повідомте адміністратора.",
  },
  {
    key: "announcement.posted",
    description: "Оголошення для працівника в межах адресованого вузла",
    text: "📢 {{title}}\n\n{{body}}",
  },
  {
    key: "poll.opened",
    description: "Нове опитування — питання й кнопки-варіанти (кнопки формуються окремо, не в тексті шаблону)",
    text: "🗳 {{question}}\n\nОберіть варіант кнопкою нижче.",
  },
  {
    key: "vacancy.opened",
    description: "Адміністратору об'єкта — з'явилась вакансія",
    text: "Нова вакансія: {{positionTitle}} ({{objectName}}) — {{reason}}. Потрібно розмістити оголошення й почати пошук кандидатів.",
  },
  {
    key: "reminder.due",
    description: "Автору особистого нагадування — настав термін",
    text: "Нагадування про {{fullName}}: «{{text}}».",
  },
];

/** Тільки create-if-missing — щоб повторний seed не переписував тексти, які сисадмін уже відредагував через /catalog. */
async function seedNotificationTemplates() {
  for (const t of notificationTemplates) {
    const existing = await prisma.notificationTemplate.findUnique({ where: { key: t.key } });
    if (existing) continue;
    await prisma.notificationTemplate.create({ data: t });
  }
}

async function main() {
  console.log("Дерево об'єктів...");
  await seedOrgTree();

  console.log("Каталог посад...");
  await seedPositionProfiles();

  console.log("Довідник компетенцій...");
  await seedCompetencies();

  console.log("Компетенції по посадах...");
  await seedPositionCompetencies();

  console.log("Навчальні матеріали...");
  await seedMaterials();

  console.log("Профілі доступу...");
  const accessProfileIdByName = await seedAccessProfiles();

  console.log("Призначення профілів доступу посадам...");
  await seedPositionAccessAssignments(accessProfileIdByName);

  console.log("Шаблон онбордингу...");
  await seedOnboardingTemplate();

  console.log("Довідник приводів рейтингу...");
  await seedRatingCategories();

  console.log("Каталог бейджів...");
  await seedBadges();

  console.log("Довідник причин заморозки...");
  await seedFreezeReasons();

  console.log("Шаблон переведення...");
  await seedTransferTemplate();

  console.log("Довідник причин звільнення...");
  await seedTerminationReasons();

  console.log("Шаблон звільнення...");
  await seedOffboardingTemplate();

  console.log("Довідник типів документів...");
  await seedDocumentTypes();

  console.log("Тестові облікові записи...");
  await seedTestUsers();

  console.log("Керівники вузлів...");
  await seedOrgHeads();

  console.log("Лінійний персонал...");
  await seedLineStaff();

  console.log("Обладнання...");
  await seedEquipment();

  console.log("Шаблони сповіщень...");
  await seedNotificationTemplates();

  console.log("Готово.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
