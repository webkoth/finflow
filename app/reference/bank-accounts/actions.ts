"use server"

import { revalidatePath } from "next/cache"
import { prisma } from "@/lib/db"
import { validateBankAccountInput } from "@/lib/domain/reference/bank-account"

const PATH = "/reference/bank-accounts"

function str(fd: FormData, key: string): string {
  return String(fd.get(key) ?? "").trim()
}

function parse(fd: FormData) {
  return {
    name: str(fd, "name"),
    accountNumber: str(fd, "accountNumber"),
    bankName: str(fd, "bankName"),
    bankBic: str(fd, "bankBic"),
    currency: str(fd, "currency") || "RUB",
    organization: str(fd, "organization"),
  }
}

export async function createBankAccount(
  _prev: { error: string | null },
  fd: FormData
): Promise<{ error: string | null }> {
  const input = parse(fd)
  const err = validateBankAccountInput(input)
  if (err) return { error: err }
  await prisma.bankAccount.create({ data: input })
  revalidatePath(PATH)
  return { error: null }
}

export async function updateBankAccount(
  _prev: { error: string | null },
  fd: FormData
): Promise<{ error: string | null }> {
  const id = str(fd, "id")
  if (!id) return { error: "Не указан идентификатор счёта" }
  const input = parse(fd)
  const err = validateBankAccountInput(input)
  if (err) return { error: err }
  await prisma.bankAccount.update({ where: { id }, data: input })
  revalidatePath(PATH)
  return { error: null }
}

export async function setBankAccountActive(fd: FormData): Promise<void> {
  const id = str(fd, "id")
  const active = str(fd, "active") === "1"
  if (!id) return
  await prisma.bankAccount.update({ where: { id }, data: { isActive: active } })
  revalidatePath(PATH)
}
