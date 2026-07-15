// app/requests/[uid]/actions.ts
"use server"

import { revalidatePath } from "next/cache"
import { prisma } from "@/lib/db"

export type FormState = { error: string | null }

// Объяснение бухгалтера к заявке (обычно — почему красная).
// Автор — текстовое поле до появления авторизации в приложении.
export async function addExecutionComment(
  _prevState: FormState,
  formData: FormData
): Promise<FormState> {
  const uid = String(formData.get("uid") ?? "")
  const author = String(formData.get("author") ?? "").trim()
  const text = String(formData.get("text") ?? "").trim()

  if (!author) return { error: "Укажите автора" }
  if (!text) return { error: "Комментарий не может быть пустым" }

  const request = await prisma.paymentRequest.findUnique({ where: { uid } })
  if (!request) return { error: "Заявка не найдена" }

  await prisma.executionComment.create({
    data: { requestId: request.id, author, text },
  })

  revalidatePath(`/requests/${uid}`)
  revalidatePath("/requests")
  return { error: null }
}
