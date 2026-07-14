import Link from "next/link"

export default function Page() {
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
      </div>
    </div>
  )
}
