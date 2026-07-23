// app/reference/cashflow-items/actions.ts
"use server"

import { revalidatePath } from "next/cache"
import { prisma } from "@/lib/db"
import { requireAction } from "@/lib/auth/session"

export type FormState = { error: string | null }

// Переключает локальный признак «оплата за товар» у конечной статьи ДДС.
export async function toggleIsGoods(
  _prevState: FormState,
  formData: FormData
): Promise<FormState> {
  const auth = await requireAction("manage_cash_flow_items")
  if (auth.error) return { error: auth.error }

  const id = String(formData.get("id") ?? "")
  const article = await prisma.article.findUnique({ where: { id } })
  if (!article || article.kind !== "CASHFLOW" || article.isGroup) {
    return { error: "Статья не найдена" }
  }

  await prisma.article.update({
    where: { id },
    data: { isGoods: !article.isGoods },
  })
  revalidatePath("/reference/cashflow-items")
  return { error: null }
}
