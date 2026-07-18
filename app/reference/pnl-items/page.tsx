import { requirePageUser } from "@/lib/auth/session"
import { prisma } from "@/lib/db"
import { can, type Role } from "@/lib/domain/permissions"
import { ArticleDictionary } from "@/components/reference/article-dictionary"
import { createArticle, setArticleActive, updateArticle } from "./actions"

export const dynamic = "force-dynamic"
const BASE = "/reference/pnl-items"

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ archived?: string; edit?: string }>
}) {
  const user = await requirePageUser()
  const canManage = can(user.role as Role, "manage_reference")

  const sp = await searchParams
  const showArchived = sp.archived === "1"
  const articles = await prisma.article.findMany({
    where: { kind: "PNL", ...(showArchived ? {} : { isActive: true }) },
    orderBy: { createdAt: "asc" },
  })

  let editing = undefined as (typeof articles)[number] | undefined
  if (sp.edit) {
    editing =
      articles.find((a) => a.id === sp.edit) ??
      (await prisma.article.findUnique({ where: { id: sp.edit } })) ??
      undefined
  }

  return (
    <main className="mx-auto max-w-4xl space-y-8 p-8">
      <h1 className="text-2xl font-semibold">Статьи БДР</h1>
      <ArticleDictionary
        kind="PNL"
        articles={articles}
        basePath={BASE}
        showArchived={showArchived}
        editing={
          editing
            ? {
                id: editing.id,
                name: editing.name,
                code: editing.code,
                flow: editing.flow,
                isGroup: editing.isGroup,
                description: editing.description,
                parentId: editing.parentId,
              }
            : undefined
        }
        createAction={createArticle}
        updateAction={updateArticle}
        setActiveAction={setArticleActive}
        canManage={canManage}
      />
    </main>
  )
}
