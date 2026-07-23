import { prisma } from "@/lib/db"
import { getCurrentUser } from "@/lib/auth/session"
import { can, type Role } from "@/lib/domain/permissions"
import { ArticleDictionary } from "@/components/reference/article-dictionary"
import { SyncStatus } from "@/components/reference/sync-status"

export const dynamic = "force-dynamic"
const BASE = "/reference/cashflow-items"

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ archived?: string }>
}) {
  const sp = await searchParams
  const showArchived = sp.archived === "1"
  const user = await getCurrentUser()
  const canEdit = !!user && can(user.role as Role, "manage_cash_flow_items")
  const articles = await prisma.article.findMany({
    where: { kind: "CASHFLOW", ...(showArchived ? {} : { isActive: true }) },
    orderBy: { createdAt: "asc" },
  })

  return (
    <main className="mx-auto max-w-4xl space-y-8 p-8">
      <h1 className="text-2xl font-semibold">Статьи ДДС</h1>
      <p className="text-sm text-muted-foreground">
        По статьям с признаком «оплата за товар» синк создаёт черновики отправки
        платёжек поставщикам (экран «Отправка платёжек»).
      </p>
      <SyncStatus />
      <ArticleDictionary
        kind="CASHFLOW"
        articles={articles}
        basePath={BASE}
        showArchived={showArchived}
        goods={{
          canEdit,
          byId: Object.fromEntries(
            articles.filter((a) => !a.isGroup).map((a) => [a.id, a.isGoods])
          ),
        }}
      />
    </main>
  )
}
