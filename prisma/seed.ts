import { PrismaClient } from "@prisma/client"
import { fixtureDwhGateway } from "../lib/integrations/dwh-fixture"
import { fixtureOneCGateway } from "../lib/integrations/one-c-odata-fixture"
import { runReferenceSync } from "../lib/sync/run-reference-sync"
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
  // Справочники приходят из 1С. В seed материализуем их тем же конвейером,
  // что и в проде — прогоном синка по фикстуре: так у записей появляются
  // стабильные externalUid и реальный синк опознаёт их как те же самые.
  await prisma.article.deleteMany()
  await prisma.bankAccount.deleteMany()
  await prisma.referenceSyncRun.deleteMany()
  await runReferenceSync(fixtureOneCGateway, "manual")
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
