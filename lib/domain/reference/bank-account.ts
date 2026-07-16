// Чистые валидаторы банковского счёта. Без React и Prisma.

export type BankAccountInput = {
  name: string
  accountNumber: string
  bankName: string
  bankBic: string
  currency: string
  organization: string
}

export function validateBankAccountInput(
  input: BankAccountInput
): string | null {
  if (!input.name.trim()) return "Укажите название счёта"
  if (!/^\d{20}$/.test(input.accountNumber.trim()))
    return "Номер счёта — 20 цифр"
  if (!input.bankName.trim()) return "Укажите банк"
  if (!/^\d{9}$/.test(input.bankBic.trim())) return "БИК — 9 цифр"
  if (!input.organization.trim()) return "Укажите организацию-владельца"
  if (!input.currency.trim()) return "Укажите валюту"
  return null
}
