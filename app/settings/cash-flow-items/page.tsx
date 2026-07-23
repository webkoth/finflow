// app/settings/cash-flow-items/page.tsx
import { notFound } from "next/navigation"
import { prisma } from "@/lib/db"
import { getCurrentUser } from "@/lib/auth/session"
import { can, type Role } from "@/lib/domain/permissions"
import { ItemsTable, type ItemRow } from "./items-table"

export const dynamic = "force-dynamic"

export default async function CashFlowItemsPage() {
  const user = await getCurrentUser()
  if (!user || !can(user.role as Role, "manage_cash_flow_items")) notFound()

  const items = await prisma.cashFlowItemSetting.findMany({
    orderBy: { name: "asc" },
  })
  const rows: ItemRow[] = items.map((i) => ({
    id: i.id,
    name: i.name,
    isGoods: i.isGoods,
  }))

  return (
    <main className="mx-auto max-w-4xl space-y-6 p-8">
      <h1 className="text-2xl font-semibold">Статьи для отправки платёжек</h1>
      <p className="text-sm text-muted-foreground">
        По статьям с признаком «оплата за товар» синк создаёт черновики отправки
        платёжек поставщикам (экран «Отправка платёжек»).
      </p>
      <ItemsTable items={rows} />
    </main>
  )
}
