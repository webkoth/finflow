import Link from "next/link"
import { requirePageUser } from "@/lib/auth/session"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"

const items = [
  {
    href: "/reference/cashflow-items",
    title: "Статьи ДДС",
    desc: "Движение денежных средств",
  },
  {
    href: "/reference/pnl-items",
    title: "Статьи БДР",
    desc: "Бюджет доходов и расходов",
  },
  {
    href: "/reference/bank-accounts",
    title: "Банковские счета",
    desc: "Счета организаций",
  },
]

export default async function Page() {
  await requirePageUser()

  return (
    <main className="mx-auto max-w-4xl space-y-8 p-8">
      <h1 className="text-2xl font-semibold">Справочники</h1>
      <div className="grid gap-4 sm:grid-cols-3">
        {items.map((i) => (
          <Link key={i.href} href={i.href}>
            <Card className="h-full transition-colors hover:bg-accent">
              <CardHeader>
                <CardTitle className="text-base">{i.title}</CardTitle>
              </CardHeader>
              <CardContent className="text-sm text-muted-foreground">
                {i.desc}
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>
    </main>
  )
}
