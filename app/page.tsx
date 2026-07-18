import Link from "next/link"
import { requirePageUser } from "@/lib/auth/session"

export default async function Page() {
  await requirePageUser()

  return (
    <div className="flex min-h-svh p-6">
      <div className="flex max-w-md min-w-0 flex-col gap-4 text-sm leading-loose">
        <div>
          <h1 className="font-medium">finflow</h1>
          <p>Внутреннее финансовое приложение.</p>
        </div>
        <div>
          <Link
            href="/transactions"
            className="text-primary underline underline-offset-4"
          >
            Транзакции
          </Link>
        </div>
        <div>
          <Link
            href="/requests"
            className="text-primary underline underline-offset-4"
          >
            Заявки на оплату
          </Link>
        </div>
        <div>
          <Link
            href="/reference"
            className="text-primary underline underline-offset-4"
          >
            Справочники
          </Link>
        </div>
        <div>
          <Link
            href="/settings/users"
            className="text-primary underline underline-offset-4"
          >
            Пользователи
          </Link>
        </div>
        <div>
          <Link
            href="/dispatch"
            className="text-primary underline underline-offset-4"
          >
            Отправка платёжек
          </Link>
        </div>
        <div>
          <Link
            href="/settings/cash-flow-items"
            className="text-primary underline underline-offset-4"
          >
            Статьи для отправки платёжек
          </Link>
        </div>
      </div>
    </div>
  )
}
