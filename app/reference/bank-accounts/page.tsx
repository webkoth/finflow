import Link from "next/link"
import { prisma } from "@/lib/db"
import { Badge } from "@/components/ui/badge"
import { buttonVariants } from "@/components/ui/button"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { BankAccountForm } from "./bank-account-form"
import { setBankAccountActive } from "./actions"

export const dynamic = "force-dynamic"
const BASE = "/reference/bank-accounts"

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ archived?: string; edit?: string }>
}) {
  const sp = await searchParams
  const showArchived = sp.archived === "1"
  const accounts = await prisma.bankAccount.findMany({
    where: showArchived ? {} : { isActive: true },
    orderBy: { createdAt: "asc" },
  })

  let editing = undefined as (typeof accounts)[number] | undefined
  if (sp.edit) {
    editing =
      accounts.find((a) => a.id === sp.edit) ??
      (await prisma.bankAccount.findUnique({ where: { id: sp.edit } })) ??
      undefined
  }

  return (
    <main className="mx-auto max-w-5xl space-y-8 p-8">
      <h1 className="text-2xl font-semibold">Банковские счета</h1>

      <BankAccountForm
        editing={
          editing
            ? {
                id: editing.id,
                name: editing.name,
                accountNumber: editing.accountNumber,
                bankName: editing.bankName,
                bankBic: editing.bankBic,
                currency: editing.currency,
                organization: editing.organization,
              }
            : undefined
        }
        cancelHref={BASE + (showArchived ? "?archived=1" : "")}
      />

      <div className="flex justify-end">
        <Link
          href={BASE + (showArchived ? "" : "?archived=1")}
          className="text-sm text-primary underline underline-offset-4"
        >
          {showArchived ? "Скрыть архивные" : "Показать архивные"}
        </Link>
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Название</TableHead>
            <TableHead>Номер</TableHead>
            <TableHead>Банк</TableHead>
            <TableHead>БИК</TableHead>
            <TableHead>Валюта</TableHead>
            <TableHead>Организация</TableHead>
            <TableHead className="text-right">Действия</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {accounts.map((a) => (
            <TableRow key={a.id} className={a.isActive ? "" : "opacity-50"}>
              <TableCell>
                {a.name}
                {!a.isActive && (
                  <Badge variant="outline" className="ml-2">
                    архив
                  </Badge>
                )}
              </TableCell>
              <TableCell>{a.accountNumber}</TableCell>
              <TableCell>{a.bankName}</TableCell>
              <TableCell>{a.bankBic}</TableCell>
              <TableCell>{a.currency}</TableCell>
              <TableCell>{a.organization}</TableCell>
              <TableCell className="text-right">
                <div className="flex justify-end gap-2">
                  <Link
                    href={`${BASE}?edit=${a.id}${showArchived ? "&archived=1" : ""}`}
                    className={buttonVariants({ variant: "ghost", size: "sm" })}
                  >
                    Изменить
                  </Link>
                  <form action={setBankAccountActive}>
                    <input type="hidden" name="id" value={a.id} />
                    <input
                      type="hidden"
                      name="active"
                      value={a.isActive ? "" : "1"}
                    />
                    <button
                      type="submit"
                      className={buttonVariants({
                        variant: "ghost",
                        size: "sm",
                      })}
                    >
                      {a.isActive ? "В архив" : "Вернуть"}
                    </button>
                  </form>
                </div>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </main>
  )
}
