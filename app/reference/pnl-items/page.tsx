import { prisma } from "@/lib/db"
import { ArticleDictionary } from "@/components/reference/article-dictionary"
import { SyncStatus } from "@/components/reference/sync-status"

export const dynamic = "force-dynamic"
const BASE = "/reference/pnl-items"

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ archived?: string }>
}) {
  const sp = await searchParams
  const showArchived = sp.archived === "1"
  const articles = await prisma.article.findMany({
    where: { kind: "PNL", ...(showArchived ? {} : { isActive: true }) },
    orderBy: { createdAt: "asc" },
  })

  return (
    <main className="mx-auto max-w-4xl space-y-8 p-8">
      <h1 className="text-2xl font-semibold">Статьи БДР</h1>
      <SyncStatus />
      <ArticleDictionary
        kind="PNL"
        articles={articles}
        basePath={BASE}
        showArchived={showArchived}
      />
    </main>
  )
}
