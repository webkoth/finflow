"use server"

import { revalidatePath } from "next/cache"
import { requireAction } from "@/lib/auth/session"
import { prisma } from "@/lib/db"
import { parseMoneyToMinor } from "@/lib/domain/money"

export type FormState = { error: string | null }

export async function createTransaction(
  _prevState: FormState,
  formData: FormData
): Promise<FormState> {
  const auth = await requireAction("manage_reference")
  if (!auth.user) return { error: auth.error }
  const category = String(formData.get("category") ?? "").trim()
  const amountMinor = parseMoneyToMinor(String(formData.get("amount") ?? ""))
  const note = String(formData.get("note") ?? "").trim()

  if (!category) return { error: "Укажите категорию" }
  if (amountMinor === null)
    return { error: "Сумма должна быть ненулевым числом до 21,4 млн ₽" }

  await prisma.transaction.create({
    data: { category, amountMinor, note: note || null, occurredAt: new Date() },
  })

  revalidatePath("/transactions")
  return { error: null }
}
