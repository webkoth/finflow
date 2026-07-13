"use server"

import { revalidatePath } from "next/cache"
import { prisma } from "@/lib/db"

export async function createTransaction(formData: FormData) {
  const category = String(formData.get("category") ?? "").trim()
  const rawAmount = String(formData.get("amount") ?? "").replace(",", ".")
  const amountRub = Number(rawAmount)
  const note = String(formData.get("note") ?? "").trim()

  if (!category || !Number.isFinite(amountRub) || amountRub === 0) {
    throw new Error("Укажите категорию и ненулевую сумму")
  }

  await prisma.transaction.create({
    data: {
      category,
      amountMinor: Math.round(amountRub * 100),
      note: note || null,
      occurredAt: new Date(),
    },
  })

  revalidatePath("/transactions")
}
