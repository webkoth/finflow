import { PrismaClient } from "@prisma/client"
import { hashPassword } from "../lib/auth/passwords"
import { fixtureDwhGateway } from "../lib/integrations/dwh-fixture"
import { runSync } from "../lib/sync/run-sync"

const prisma = new PrismaClient()

const demo: Array<{
  occurredAt: string
  amountMinor: number
  category: string
  note?: string
}> = [
  {
    occurredAt: "2026-06-01",
    amountMinor: 12000000,
    category: "Зарплата",
    note: "Аванс",
  },
  { occurredAt: "2026-06-03", amountMinor: -450050, category: "Продукты" },
  {
    occurredAt: "2026-06-05",
    amountMinor: -120000,
    category: "Транспорт",
    note: "Проездной",
  },
  { occurredAt: "2026-06-08", amountMinor: -890000, category: "Аренда" },
  { occurredAt: "2026-06-10", amountMinor: -230075, category: "Продукты" },
  {
    occurredAt: "2026-06-12",
    amountMinor: 3500000,
    category: "Фриланс",
    note: "Проект А",
  },
  {
    occurredAt: "2026-06-15",
    amountMinor: 12000000,
    category: "Зарплата",
    note: "Оклад",
  },
  {
    occurredAt: "2026-06-17",
    amountMinor: -156000,
    category: "Развлечения",
    note: "Кино",
  },
  { occurredAt: "2026-06-20", amountMinor: -340025, category: "Продукты" },
  {
    occurredAt: "2026-06-22",
    amountMinor: -78000,
    category: "Транспорт",
    note: "Такси",
  },
  {
    occurredAt: "2026-06-25",
    amountMinor: -1200000,
    category: "Техника",
    note: "Клавиатура",
  },
  { occurredAt: "2026-06-28", amountMinor: -95050, category: "Развлечения" },
]

async function main() {
  await prisma.transaction.deleteMany()
  await prisma.transaction.createMany({
    data: demo.map((d) => ({
      occurredAt: new Date(d.occurredAt),
      amountMinor: d.amountMinor,
      category: d.category,
      note: d.note ?? null,
    })),
  })
  const count = await prisma.transaction.count()
  console.log(`Seed: создано ${count} транзакций`)

  // Демо-пользователи для e2e и песочницы (пароли известны тестам).
  // Guard: демо-логины с известными паролями (в т.ч. e2e-owner — роль
  // owner) не должны попасть в production при случайном запуске сида
  // с боевым окружением.
  if (process.env.NODE_ENV !== "production") {
    const demoUsers = [
      { login: "e2e-owner", name: "E2E Собственник", role: "owner" as const },
      {
        login: "e2e-accountant",
        name: "E2E Бухгалтер",
        role: "accountant" as const,
      },
      { login: "e2e-viewer", name: "E2E Читатель", role: "viewer" as const },
    ]
    for (const u of demoUsers) {
      await prisma.user.upsert({
        where: { login: u.login },
        // passwordHash обновляем и при апдейте: повторный сид чинит пароль,
        // если e2e-тест его менял.
        update: {
          passwordHash: hashPassword(`${u.login}-password`),
          isActive: true,
          role: u.role,
        },
        create: { ...u, passwordHash: hashPassword(`${u.login}-password`) },
      })
    }
    console.log(
      "Seed: демо-пользователи (e2e-owner / e2e-accountant / e2e-viewer)"
    )
  } else {
    console.log("Seed: демо-пользователи пропущены (production)")
  }

  // Настройки светофора: дефолты из домена.
  const verdictThresholds: Array<{ key: string; value: number }> = [
    { key: "fundDeficitPercent", value: 20 },
    { key: "oldPartnerMonths", value: 12 },
    { key: "minOperationsForConstant", value: 3 },
  ]
  for (const t of verdictThresholds) {
    await prisma.verdictThreshold.upsert({
      where: { key: t.key },
      update: {},
      create: t,
    })
  }
  const verdictCheckDefaults: Array<{
    checkId: string
    includeInVerdict: boolean
  }> = [
    { checkId: "funds", includeInVerdict: true },
    { checkId: "fund_balance", includeInVerdict: true },
    { checkId: "finplan", includeInVerdict: false },
    { checkId: "document", includeInVerdict: true },
    { checkId: "order_contract", includeInVerdict: true },
    { checkId: "partner", includeInVerdict: true },
    { checkId: "preapproved", includeInVerdict: false },
  ]
  for (const c of verdictCheckDefaults) {
    await prisma.verdictCheckSetting.upsert({
      where: { checkId: c.checkId },
      update: {},
      create: c,
    })
  }
  console.log("Seed: настройки светофора")

  // Статья «за товар» для демо и e2e: черновики отправок создаст синк.
  await prisma.cashFlowItemSetting.upsert({
    where: { name: "Оплата поставщикам за товар" },
    update: { isGoods: true },
    create: { name: "Оплата поставщикам за товар", isGoods: true },
  })
  console.log("Seed: статья «Оплата поставщикам за товар» помечена isGoods")

  // --- Справочники ---
  await prisma.article.deleteMany()
  await prisma.bankAccount.deleteMany()

  const opGroup = await prisma.article.create({
    data: {
      kind: "CASHFLOW",
      name: "Операционная деятельность",
      code: "1",
      isGroup: true,
    },
  })
  await prisma.article.createMany({
    data: [
      {
        kind: "CASHFLOW",
        name: "Поступления от покупателей",
        code: "1.1",
        flow: "INFLOW",
        parentId: opGroup.id,
      },
      {
        kind: "CASHFLOW",
        name: "Оплата поставщикам",
        code: "1.2",
        flow: "OUTFLOW",
        parentId: opGroup.id,
      },
    ],
  })
  const finGroup = await prisma.article.create({
    data: {
      kind: "CASHFLOW",
      name: "Финансовая деятельность",
      code: "2",
      isGroup: true,
    },
  })
  await prisma.article.create({
    data: {
      kind: "CASHFLOW",
      name: "Кредиты и займы",
      code: "2.1",
      flow: "INFLOW",
      parentId: finGroup.id,
    },
  })

  const incGroup = await prisma.article.create({
    data: { kind: "PNL", name: "Доходы", code: "1", isGroup: true },
  })
  await prisma.article.create({
    data: {
      kind: "PNL",
      name: "Выручка",
      code: "1.1",
      flow: "INFLOW",
      parentId: incGroup.id,
    },
  })
  const expGroup = await prisma.article.create({
    data: { kind: "PNL", name: "Расходы", code: "2", isGroup: true },
  })
  await prisma.article.createMany({
    data: [
      {
        kind: "PNL",
        name: "Зарплата",
        code: "2.1",
        flow: "OUTFLOW",
        parentId: expGroup.id,
      },
      {
        kind: "PNL",
        name: "Аренда",
        code: "2.2",
        flow: "OUTFLOW",
        parentId: expGroup.id,
      },
    ],
  })

  await prisma.bankAccount.createMany({
    data: [
      {
        name: "Расчётный (Сбербанк)",
        accountNumber: "40702810900000001234",
        bankName: "ПАО Сбербанк",
        bankBic: "044525225",
        currency: "RUB",
        organization: "ООО «Ромашка»",
      },
      {
        name: "Расчётный (Т-Банк)",
        accountNumber: "40702810400000005678",
        bankName: "АО «Т-Банк»",
        bankBic: "044525974",
        currency: "RUB",
        organization: "ООО «Василёк»",
      },
    ],
  })
  console.log("Seed: справочники наполнены")

  // Демо-заявки — через реальный конвейер синка (fixture-шлюз).
  const sync = await runSync(fixtureDwhGateway, "seed")
  console.log(`Seed: синк заявок — ${JSON.stringify(sync)}`)
  if (sync.skipped || sync.status !== "ok") {
    throw new Error(`Seed: синк заявок не удался — ${JSON.stringify(sync)}`)
  }
}

main()
  .finally(() => prisma.$disconnect())
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
