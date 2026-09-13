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
  validMonths?: number;
  resetOnBreakMonths?: number;
  isBonus?: boolean;
};

// docs/hr-transfers-competencies-v1.2.md §1, таблиця «Стартові строки дії»
const competencies: CompetencySeed[] = [
  { code: "COMPANY_BASICS", name: "Компанія і структура", resetOnBreakMonths: 12 },
  { code: "LABOR_SAFETY", name: "Охорона праці", validMonths: 12 },
  { code: "FIRE_SAFETY", name: "Пожежна безпека", validMonths: 12 },
  { code: "SANITATION_HACCP", name: "Санітарія і HACCP", validMonths: 12 },
  { code: "SERVICE_STANDARDS", name: "Стандарти обслуговування", validMonths: 24, resetOnBreakMonths: 18 },
  { code: "CASHIER_PRRO", name: "Каса і ПРРО", validMonths: 24, resetOnBreakMonths: 12 },
  { code: "WEIGHED_GOODS_DATES", name: "Ваговий товар і терміни", validMonths: 24, resetOnBreakMonths: 18 },
  { code: "MATERIAL_LIABILITY", name: "Матвідповідальність", validMonths: 24, resetOnBreakMonths: 12 },
  { code: "BAKING_TECHNOLOGY", name: "Технологія випічки", validMonths: 24, resetOnBreakMonths: 18 },
  { code: "BAKERY_EQUIPMENT", name: "Обладнання цеху", validMonths: 24, resetOnBreakMonths: 12 },
  { code: "ROAD_SAFETY", name: "Безпека дорожнього руху", validMonths: 12 },
  { code: "TRADE_RULES", name: "Правила торгівлі", validMonths: 12, isBonus: true },
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

// Стартова матриця прав — docs/hr-transfers-competencies-v1.2.md... ні,
// docs/hr-system-catalogs-v1.1.md §4.4 «Стартова матриця». Іду за таблицею
// рядок за рядком: конкретні посади мають явний список, а нетиповані рівні
// (10/15/20) — загальний кошик за замовчуванням.
type GrantSeed = { capability: Capability; scope: ScopeType };

const OWN_OBJECT_FULL: GrantSeed[] = [
  { capability: Capability.VIEW_EMPLOYEE, scope: ScopeType.OWN_OBJECT },
  { capability: Capability.EDIT_PROFILE, scope: ScopeType.OWN_OBJECT },
  { capability: Capability.ACTIVATE_EMPLOYEE, scope: ScopeType.OWN_OBJECT },
  { capability: Capability.ASSIGN_CURATOR, scope: ScopeType.OWN_OBJECT },
  { capability: Capability.UPLOAD_DOCUMENTS, scope: ScopeType.OWN_OBJECT },
  { capability: Capability.RUN_ATTESTATION, scope: ScopeType.OWN_OBJECT },
  { capability: Capability.RATE_POSITIVE_NEGATIVE, scope: ScopeType.OWN_OBJECT },
  { capability: Capability.ASSIGN_EQUIPMENT, scope: ScopeType.OWN_OBJECT },
  { capability: Capability.INIT_TERMINATION, scope: ScopeType.OWN_OBJECT },
  { capability: Capability.PRINT_CLEARANCE, scope: ScopeType.OWN_OBJECT },
  { capability: Capability.MANAGE_MATERIALS, scope: ScopeType.OWN_OBJECT },
  { capability: Capability.MANAGE_REMINDERS, scope: ScopeType.OWN_OBJECT },
  // FREEZE/INIT_TRANSFER/APPROVE_TRANSFER немає в catalogs-v1.1 §4.4 (той
  // документ — до v1.2 переведення/заморозки). Ініціює керівник, тому
  // FREEZE й INIT_TRANSFER — тут; APPROVE_TRANSFER — тільки в директора
  // кластера й вище (docs v1.2 §2.1).
  { capability: Capability.FREEZE, scope: ScopeType.OWN_OBJECT },
  { capability: Capability.INIT_TRANSFER, scope: ScopeType.OWN_OBJECT },
];

const OWN_SUBTREE_FULL: GrantSeed[] = [
  ...OWN_OBJECT_FULL.map((g) => ({ capability: g.capability, scope: ScopeType.OWN_SUBTREE })),
  { capability: Capability.VIEW_ANALYTICS, scope: ScopeType.OWN_SUBTREE },
  { capability: Capability.APPROVE_TRANSFER, scope: ScopeType.OWN_SUBTREE },
];

const ACCOUNTANT_GRANTS: GrantSeed[] = [
  { capability: Capability.VIEW_EMPLOYEE, scope: ScopeType.COMPANY },
  { capability: Capability.VIEW_DOCUMENTS, scope: ScopeType.COMPANY },
  { capability: Capability.UPLOAD_DOCUMENTS, scope: ScopeType.COMPANY },
  { capability: Capability.CLOSE_TERMINATION, scope: ScopeType.COMPANY },
  { capability: Capability.PRINT_CLEARANCE, scope: ScopeType.COMPANY },
  { capability: Capability.MANAGE_REMINDERS, scope: ScopeType.COMPANY },
];

const ALL_CAPABILITIES_COMPANY: GrantSeed[] = Object.values(Capability).map((capability) => ({
  capability,
  scope: ScopeType.COMPANY,
}));

const explicitGrants: Record<string, GrantSeed[]> = {
  "Адміністратор магазину": OWN_OBJECT_FULL,
  "Завідуючий цехом": OWN_OBJECT_FULL,
  "Директор кластера": OWN_SUBTREE_FULL,
  "Категорійний менеджер": [
    { capability: Capability.VIEW_EMPLOYEE, scope: ScopeType.SUBORDINATES },
    { capability: Capability.RATE_POSITIVE_NEGATIVE, scope: ScopeType.SUBORDINATES },
    { capability: Capability.VIEW_ANALYTICS, scope: ScopeType.COMPANY },
  ],
  "Бухгалтер": ACCOUNTANT_GRANTS,
  // "Бухгалтер-касир" не названий у матриці окремо — даю ті самі права,
  // що й "Бухгалтер" (той самий systemRole ACCOUNTANT). Це моє припущення,
  // не буквальний рядок з докс.
  "Бухгалтер-касир": ACCOUNTANT_GRANTS,
  "Бухгалтер-ревізор": [
    { capability: Capability.VIEW_EMPLOYEE, scope: ScopeType.COMPANY },
    { capability: Capability.CLEAR_EQUIPMENT, scope: ScopeType.COMPANY },
    { capability: Capability.ASSIGN_EQUIPMENT, scope: ScopeType.COMPANY },
  ],
  "Оператор 1С": [
    { capability: Capability.VIEW_EMPLOYEE, scope: ScopeType.COMPANY },
    { capability: Capability.SET_1C_PASSWORD, scope: ScopeType.COMPANY },
  ],
  "Системний адміністратор": [
    { capability: Capability.MANAGE_TEMPLATES, scope: ScopeType.COMPANY },
    { capability: Capability.MANAGE_ORG_STRUCTURE, scope: ScopeType.COMPANY },
    { capability: Capability.MANAGE_MATERIALS, scope: ScopeType.COMPANY },
    { capability: Capability.VIEW_AUDIT_LOG, scope: ScopeType.COMPANY },
  ],
  "Фінансовий директор": ALL_CAPABILITIES_COMPANY,
  "Власник": ALL_CAPABILITIES_COMPANY,
};

const SHIFT_LEAD_GRANTS: GrantSeed[] = [
  { capability: Capability.VIEW_EMPLOYEE, scope: ScopeType.OWN_DEPARTMENT },
  { capability: Capability.CLOSE_INTERNSHIP, scope: ScopeType.SUBORDINATES },
  { capability: Capability.RATE_POSITIVE_NEGATIVE, scope: ScopeType.SUBORDINATES },
];

const SELF_VIEW_GRANTS: GrantSeed[] = [{ capability: Capability.VIEW_EMPLOYEE, scope: ScopeType.SELF }];

// "Маркетолог" не підпадає під жоден рядок матриці й не має рівневого
// кошика (рівень 30 без власного рядка) — свідома прогалина з докс,
// не з мого боку. Прав не отримує, доки замовник не уточнить.
const NO_GRANTS_TITLES = new Set(["Маркетолог"]);

async function seedPermissionGrants() {
  const profiles = await prisma.positionProfile.findMany();

  for (const profile of profiles) {
    let grants = explicitGrants[profile.title];

    if (!grants && !NO_GRANTS_TITLES.has(profile.title)) {
      if (profile.level === 20) grants = SHIFT_LEAD_GRANTS;
      else if (profile.level === 10 || profile.level === 15) grants = SELF_VIEW_GRANTS;
    }

    if (!grants) continue;

    for (const g of grants) {
      const existing = await prisma.permissionGrant.findFirst({
        where: { positionProfileId: profile.id, capability: g.capability, scope: g.scope },
      });
      if (!existing) {
        await prisma.permissionGrant.create({
          data: { positionProfileId: profile.id, capability: g.capability, scope: g.scope },
        });
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

    let employment = await prisma.employment.findFirst({
      where: { personId: person.id, staffUnitId: staffUnit.id },
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

    let employment = await prisma.employment.findFirst({
      where: { personId: person.id, staffUnitId: staffUnit.id },
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
  { order: 8, title: "Вступний інструктаж з охорони праці", responsibleRole: Role.STORE_ADMIN, actionType: ActionType.MARK, isBlocking: true, slaHours: 24, module: null },
  { order: 9, title: "Інструктаж з пожежної безпеки", responsibleRole: Role.STORE_ADMIN, actionType: ActionType.MARK, isBlocking: true, slaHours: 24, module: null },
  { order: 10, title: "Видача бейджа, спецодягу, ключів", responsibleRole: Role.STORE_ADMIN, actionType: ActionType.MARK, isBlocking: false, slaHours: 72, module: null },
  { order: 11, title: "Надсилання welcomebook і матеріалів LMS", responsibleRole: null, actionType: ActionType.AUTO, isBlocking: true, slaHours: 0, module: null },
  { order: 12, title: "Знайомство з колективом і робочим місцем", responsibleRole: Role.STORE_ADMIN, actionType: ActionType.MARK, isBlocking: false, slaHours: 48, module: null },
  { order: 13, title: "Ознайомлення з обов'язковими матеріалами", responsibleRole: Role.EMPLOYEE, actionType: ActionType.MARK, isBlocking: true, slaHours: 168, module: null },
  { order: 14, title: "Стажування під наглядом куратора", responsibleRole: Role.CURATOR, actionType: ActionType.MARK, isBlocking: true, slaHours: 336, module: null },
  // order 200, не 15: модульні пункти (order 100-182 нижче) мають бути пройдені
  // ДО фінальної атестації, а не навпаки — послідовне блокування рахує єдиний
  // ланцюжок по order через усі пункти інстансу, тож атестація має йти
  // останньою в усьому чек-листі, а не одразу після базових 14 пунктів.
  { order: 200, title: "Атестація", responsibleRole: Role.STORE_ADMIN, actionType: ActionType.APPROVAL, isBlocking: true, slaHours: 72, module: null },
];

const moduleChecklistItems: ChecklistItemSeed[] = [
  { order: 100, title: "Реєстрація на касовому апараті", responsibleRole: Role.ONEC_ADMIN, actionType: ActionType.MARK, isBlocking: true, slaHours: 24, module: ChecklistModule.CASHIER },
  { order: 101, title: "Навчання роботі з ПРРО й поверненнями", responsibleRole: Role.CURATOR, actionType: ActionType.MARK, isBlocking: true, slaHours: 48, module: ChecklistModule.CASHIER },
  { order: 102, title: "Інструктаж з інкасації", responsibleRole: Role.STORE_ADMIN, actionType: ActionType.MARK, isBlocking: true, slaHours: 24, module: ChecklistModule.CASHIER },
  { order: 103, title: "Тест «Каса»", responsibleRole: Role.EMPLOYEE, actionType: ActionType.TEST, isBlocking: true, slaHours: 168, module: ChecklistModule.CASHIER, competencyCode: "CASHIER_PRRO" },

  { order: 110, title: "Договір про матвідповідальність", responsibleRole: Role.ACCOUNTANT, actionType: ActionType.MARK, isBlocking: true, slaHours: 72, module: ChecklistModule.MVO },
  { order: 111, title: "Прийом-передача ТМЦ", responsibleRole: Role.STORE_ADMIN, actionType: ActionType.MARK, isBlocking: true, slaHours: 72, module: ChecklistModule.MVO },
  { order: 112, title: "Ознайомлення з порядком інвентаризації", responsibleRole: Role.STORE_ADMIN, actionType: ActionType.MARK, isBlocking: false, slaHours: 72, module: ChecklistModule.MVO },

  { order: 120, title: "Медкнижка з чинними відмітками", responsibleRole: Role.ACCOUNTANT, actionType: ActionType.UPLOAD, isBlocking: true, slaHours: 72, module: ChecklistModule.FOOD },
  { order: 121, title: "Інструктаж з санітарії та HACCP", responsibleRole: Role.STORE_ADMIN, actionType: ActionType.MARK, isBlocking: true, slaHours: 24, module: ChecklistModule.FOOD },
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

async function seedOnboardingTemplate() {
  const existing = await prisma.processTemplate.findUnique({
    where: { code_version: { code: "ONBOARDING_BASE", version: 1 } },
  });
  if (existing) return;

  const template = await prisma.processTemplate.create({
    data: { code: "ONBOARDING_BASE", version: 1, type: ProcessType.ONBOARDING, name: "Онбординг — базовий трек" },
  });

  for (const item of [...baseChecklistItems, ...moduleChecklistItems]) {
    const competency = item.competencyCode
      ? await prisma.competency.findUniqueOrThrow({ where: { code: item.competencyCode } })
      : null;
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
        competencyId: competency?.id,
      },
    });
  }
}

// Конструктор чек-листа атестації — docs catalogs-v1.1.md §7. Приклади
// касира й пекаря взяті дослівно з §7.1/§7.2, разом з розбивкою по балах;
// maxPoints зазвичай 2 ("0/1/2"), крім розділу "Практика", де сума
// розділу з докс не ділиться порівну на 2 бали за пункт.
type AttestationItemSeed = { title: string; maxPoints: number };
type AttestationSectionSeed = { title: string; items: AttestationItemSeed[] };
type AttestationTemplateSeed = { positionTitle: string; passThresholdPercent: number; sections: AttestationSectionSeed[] };

const attestationTemplates: AttestationTemplateSeed[] = [
  {
    positionTitle: "Касир",
    passThresholdPercent: 80,
    sections: [
      {
        title: "Компанія",
        items: [
          { title: "Історія та цінності", maxPoints: 2 },
          { title: "Структура магазину", maxPoints: 2 },
          { title: "Кому підпорядковується", maxPoints: 2 },
          { title: "Графік і правила внутрішнього розпорядку", maxPoints: 2 },
        ],
      },
      {
        title: "Каса й ПРРО",
        items: [
          { title: "Відкриття та закриття зміни", maxPoints: 2 },
          { title: "Пробиття чека", maxPoints: 2 },
          { title: "Повернення", maxPoints: 2 },
          { title: "Скасування позиції", maxPoints: 2 },
          { title: "Оплата карткою", maxPoints: 2 },
          { title: "Дії при збої", maxPoints: 2 },
          { title: "Інкасація", maxPoints: 2 },
        ],
      },
      {
        title: "Товар",
        items: [
          { title: "Пошук за штрихкодом і кодом", maxPoints: 2 },
          { title: "Ваговий товар", maxPoints: 2 },
          { title: "Перевірка терміну придатності", maxPoints: 2 },
          { title: "Дії при розбіжності ціни", maxPoints: 2 },
        ],
      },
      {
        title: "Обслуговування",
        items: [
          { title: "Привітання і прощання", maxPoints: 2 },
          { title: "Робота з конфліктом", maxPoints: 2 },
          { title: "Робота з чергою", maxPoints: 2 },
          { title: "Продаж супутнього товару", maxPoints: 2 },
        ],
      },
      {
        title: "Санітарія",
        items: [
          { title: "Особиста гігієна", maxPoints: 2 },
          { title: "Санітарний одяг", maxPoints: 2 },
          { title: "Прибирання робочої зони", maxPoints: 2 },
        ],
      },
      {
        title: "ОП і ПБ",
        items: [
          { title: "Дії при пожежі", maxPoints: 2 },
          { title: "Розташування вогнегасника й виходів", maxPoints: 2 },
          { title: "Дії при травмі", maxPoints: 2 },
        ],
      },
      {
        title: "Практика",
        items: [
          { title: "Обслуговування 5 клієнтів під наглядом", maxPoints: 4 },
          { title: "Самостійне закриття зміни", maxPoints: 4 },
        ],
      },
    ],
  },
  {
    positionTitle: "Пекар",
    passThresholdPercent: 80,
    sections: [
      {
        title: "Компанія",
        items: [
          { title: "Цінності", maxPoints: 2 },
          { title: "Структура цеху", maxPoints: 2 },
          { title: "Підпорядкування", maxPoints: 2 },
          { title: "Змінний графік", maxPoints: 2 },
        ],
      },
      {
        title: "Рецептури й процес",
        items: [
          { title: "Читання технологічної карти", maxPoints: 2 },
          { title: "Порядок замісу", maxPoints: 2 },
          { title: "Розстойка", maxPoints: 2 },
          { title: "Випікання", maxPoints: 2 },
          { title: "Контроль ваги й виходу", maxPoints: 2 },
        ],
      },
      {
        title: "Обладнання",
        items: [
          { title: "Тістоміс", maxPoints: 2 },
          { title: "Піч", maxPoints: 2 },
          { title: "Розстійна шафа", maxPoints: 2 },
          { title: "Порядок увімкнення і зупинки", maxPoints: 2 },
          { title: "Дії при збої", maxPoints: 2 },
        ],
      },
      {
        title: "Санітарія і HACCP",
        items: [
          { title: "Особиста гігієна", maxPoints: 2 },
          { title: "Санітарний одяг", maxPoints: 2 },
          { title: "Миття й дезінфекція", maxPoints: 2 },
          { title: "Контроль температур", maxPoints: 2 },
          { title: "Ведення журналів", maxPoints: 2 },
        ],
      },
      {
        title: "Сировина",
        items: [
          { title: "Приймання", maxPoints: 2 },
          { title: "Умови зберігання", maxPoints: 2 },
          { title: "Контроль термінів", maxPoints: 2 },
          { title: "Дії при невідповідності", maxPoints: 2 },
        ],
      },
      {
        title: "ОП і ПБ",
        items: [
          { title: "Робота з гарячим обладнанням", maxPoints: 2 },
          { title: "Дії при опіку", maxPoints: 2 },
          { title: "Дії при пожежі", maxPoints: 2 },
          { title: "Виходи й вогнегасники", maxPoints: 2 },
        ],
      },
      {
        title: "Практика",
        items: [{ title: "Самостійне виготовлення партії під наглядом", maxPoints: 6 }],
      },
    ],
  },
];

async function seedAttestationTemplates() {
  for (const t of attestationTemplates) {
    const position = await prisma.positionProfile.findUnique({ where: { title: t.positionTitle } });
    if (!position) continue;

    // Ідемпотентно: якщо шаблон уже є (могли відредагувати вручну через
    // конструктор), не перезаписуємо.
    const existing = await prisma.attestationTemplate.findUnique({ where: { positionProfileId: position.id } });
    if (existing) continue;

    const template = await prisma.attestationTemplate.create({
      data: { positionProfileId: position.id, passThresholdPercent: t.passThresholdPercent },
    });

    for (const [sectionIndex, section] of t.sections.entries()) {
      const createdSection = await prisma.attestationSection.create({
        data: { templateId: template.id, order: sectionIndex + 1, title: section.title },
      });
      for (const [itemIndex, item] of section.items.entries()) {
        await prisma.attestationItem.create({
          data: { sectionId: createdSection.id, order: itemIndex + 1, title: item.title, maxPoints: item.maxPoints },
        });
      }
    }
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
// Пункт 10 навмисно завжди неблокуючий — спрощення відносно "блокує для
// рівня ≥ 20" (блокування прив'язане до шаблону, не до інстансу).
const terminationChecklistItems: ChecklistItemSeed[] = [
  { order: 1, title: "Ініціація: причина, останній робочий день", responsibleRole: Role.STORE_ADMIN, actionType: ActionType.INPUT_VALUE, isBlocking: true, slaHours: 0, module: null },
  { order: 2, title: "Заява на звільнення прийнята", responsibleRole: Role.ACCOUNTANT, actionType: ActionType.UPLOAD, isBlocking: true, slaHours: 24, module: null },
  { order: 3, title: "Блокування облікових записів 1С", responsibleRole: Role.ONEC_ADMIN, actionType: ActionType.MARK, isBlocking: true, slaHours: 4, module: null },
  { order: 4, title: "Зняття доступу до каси й ПРРО", responsibleRole: Role.ONEC_ADMIN, actionType: ActionType.MARK, isBlocking: true, slaHours: 4, module: null },
  { order: 5, title: "Блокування доступу до системи", responsibleRole: null, actionType: ActionType.AUTO, isBlocking: true, slaHours: 0, module: null },
  { order: 6, title: "Квитування закріпленого обладнання", responsibleRole: Role.AUDITOR, actionType: ActionType.MARK, isBlocking: true, slaHours: 48, module: null },
  { order: 7, title: "Інвентаризація та передача ТМЦ", responsibleRole: Role.AUDITOR, actionType: ActionType.MARK, isBlocking: true, slaHours: 72, module: null },
  { order: 8, title: "Повернення бейджа, ключів, спецодягу, форми", responsibleRole: Role.STORE_ADMIN, actionType: ActionType.MARK, isBlocking: true, slaHours: 24, module: null },
  { order: 9, title: "Повернення техніки", responsibleRole: Role.STORE_ADMIN, actionType: ActionType.MARK, isBlocking: false, slaHours: 24, module: null },
  { order: 10, title: "Передача справ наступнику або куратору", responsibleRole: Role.STORE_ADMIN, actionType: ActionType.MARK, isBlocking: false, slaHours: 48, module: null },
  { order: 11, title: "Відмітка про наявність/відсутність претензій", responsibleRole: Role.AUDITOR, actionType: ActionType.APPROVAL, isBlocking: true, slaHours: 0, module: null },
  { order: 12, title: "Погодження звільнення", responsibleRole: Role.COO, actionType: ActionType.APPROVAL, isBlocking: true, slaHours: 24, module: null },
  { order: 13, title: "Оформлення звільнення", responsibleRole: Role.ACCOUNTANT, actionType: ActionType.MARK, isBlocking: true, slaHours: 0, module: null },
  { order: 14, title: "Друк і підписання листа узгодження", responsibleRole: Role.ACCOUNTANT, actionType: ActionType.PRINT, isBlocking: true, slaHours: 0, module: null },
  { order: 15, title: "Вихідне інтерв'ю", responsibleRole: Role.STORE_ADMIN, actionType: ActionType.INPUT_VALUE, isBlocking: false, slaHours: 168, module: null },
  { order: 16, title: "Архівація профілю, статус TERMINATED", responsibleRole: null, actionType: ActionType.AUTO, isBlocking: true, slaHours: 0, module: null },
];

async function seedOffboardingTemplate() {
  const existing = await prisma.processTemplate.findUnique({
    where: { code_version: { code: "OFFBOARDING_BASE", version: 1 } },
  });
  if (existing) return;

  const template = await prisma.processTemplate.create({
    data: { code: "OFFBOARDING_BASE", version: 1, type: ProcessType.OFFBOARDING, name: "Звільнення — базовий чек-ліст" },
  });

  for (const item of terminationChecklistItems) {
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

  console.log("Матриця прав...");
  await seedPermissionGrants();

  console.log("Шаблон онбордингу...");
  await seedOnboardingTemplate();

  console.log("Конструктор атестації (приклади касира й пекаря)...");
  await seedAttestationTemplates();

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
