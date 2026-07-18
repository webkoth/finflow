import { revalidatePath } from "next/cache"
import { requireAction } from "@/lib/auth/session"
import { prisma } from "@/lib/db"
import {
  validateArticleInput,
  type ArticleFlow,
  type ArticleNode,
} from "@/lib/domain/reference/articles"

export type ArticleFormState = { error: string | null }
export type ArticleKind = "CASHFLOW" | "PNL"

function str(fd: FormData, key: string): string {
  return String(fd.get(key) ?? "").trim()
}

function parseArticleForm(fd: FormData) {
  const isGroup = str(fd, "isGroup") === "1"
  const flowRaw = str(fd, "flow")
  const flow: ArticleFlow | null =
    flowRaw === "INFLOW" || flowRaw === "OUTFLOW"
      ? (flowRaw as ArticleFlow)
      : null
  const parentRaw = str(fd, "parentId")
  return {
    name: str(fd, "name"),
    code: str(fd, "code") || null,
    flow: isGroup ? null : flow,
    isGroup,
    description: str(fd, "description") || null,
    parentId: parentRaw && parentRaw !== "__none__" ? parentRaw : null,
  }
}

async function loadNodes(kind: ArticleKind): Promise<ArticleNode[]> {
  const items = await prisma.article.findMany({ where: { kind } })
  return items.map((a) => ({
    id: a.id,
    name: a.name,
    code: a.code,
    flow: a.flow,
    isGroup: a.isGroup,
    parentId: a.parentId,
  }))
}

export async function createArticleAction(
  kind: ArticleKind,
  path: string,
  _prev: ArticleFormState,
  fd: FormData
): Promise<ArticleFormState> {
  const auth = await requireAction("manage_reference")
  if (!auth.user) return { error: auth.error }
  const input = parseArticleForm(fd)
  const err = validateArticleInput(input, await loadNodes(kind))
  if (err) return { error: err }
  await prisma.article.create({
    data: {
      kind,
      name: input.name.trim(),
      code: input.code,
      flow: input.flow,
      isGroup: input.isGroup,
      description: input.description,
      parentId: input.parentId,
    },
  })
  revalidatePath(path)
  return { error: null }
}

export async function updateArticleAction(
  kind: ArticleKind,
  path: string,
  _prev: ArticleFormState,
  fd: FormData
): Promise<ArticleFormState> {
  const auth = await requireAction("manage_reference")
  if (!auth.user) return { error: auth.error }
  const id = str(fd, "id")
  if (!id) return { error: "Не указан идентификатор статьи" }
  const input = parseArticleForm(fd)
  const err = validateArticleInput(input, await loadNodes(kind), id)
  if (err) return { error: err }
  await prisma.article.update({
    where: { id },
    data: {
      name: input.name.trim(),
      code: input.code,
      flow: input.flow,
      isGroup: input.isGroup,
      description: input.description,
      parentId: input.parentId,
    },
  })
  revalidatePath(path)
  return { error: null }
}

export async function setArticleActiveAction(
  path: string,
  fd: FormData
): Promise<void> {
  const auth = await requireAction("manage_reference")
  if (!auth.user) return
  const id = str(fd, "id")
  const active = str(fd, "active") === "1"
  if (!id) return
  await prisma.article.update({ where: { id }, data: { isActive: active } })
  revalidatePath(path)
}
