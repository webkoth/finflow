import { PrismaClient } from "@prisma/client"
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

  // --- Справочники ---
  await prisma.article.deleteMany()
  await prisma.bankAccount.deleteMany()

  const opGroup = await prisma.article.create({
    data: { kind: "CASHFLOW", name: "Операционная деятельность", code: "1", isGroup: true },
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
    data: { kind: "CASHFLOW", name: "Финансовая деятельность", code: "2", isGroup: true },
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
    data: { kind: "PNL", name: "Выручка", code: "1.1", flow: "INFLOW", parentId: incGroup.id },
  })
  const expGroup = await prisma.article.create({
    data: { kind: "PNL", name: "Расходы", code: "2", isGroup: true },
  })
  await prisma.article.createMany({
    data: [
      { kind: "PNL", name: "Зарплата", code: "2.1", flow: "OUTFLOW", parentId: expGroup.id },
      { kind: "PNL", name: "Аренда", code: "2.2", flow: "OUTFLOW", parentId: expGroup.id },
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
