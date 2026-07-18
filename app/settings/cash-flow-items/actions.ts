// app/settings/cash-flow-items/actions.ts
"use server"

import { revalidatePath } from "next/cache"
import { prisma } from "@/lib/db"
import { requireAction } from "@/lib/auth/session"

export type FormState = { error: string | null }

export async function toggleIsGoods(
  _prevState: FormState,
  formData: FormData
): Promise<FormState> {
  const auth = await requireAction("manage_cash_flow_items")
  if (auth.error) return { error: auth.error }

  const id = String(formData.get("id") ?? "")
  const item = await prisma.cashFlowItemSetting.findUnique({ where: { id } })
  if (!item) return { error: "Статья не найдена" }

  await prisma.cashFlowItemSetting.update({
    where: { id },
    data: { isGoods: !item.isGoods },
  })
  revalidatePath("/settings/cash-flow-items")
  return { error: null }
}
