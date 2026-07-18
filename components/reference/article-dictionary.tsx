import Link from "next/link"
import {
  buildArticleTree,
  flattenArticleTree,
  type ArticleNode,
} from "@/lib/domain/reference/articles"
import { Badge } from "@/components/ui/badge"
import { Button, buttonVariants } from "@/components/ui/button"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { cn } from "@/lib/utils"
import {
  ArticleForm,
  type EditingArticle,
  type GroupOption,
} from "./article-form"
import { FLOW_LABELS } from "./article-labels"

type Kind = "CASHFLOW" | "PNL"
type FormState = { error: string | null }
type Row = ArticleNode & { isActive: boolean }

// Классы отступа по глубине (статические — Tailwind их видит; без инлайн-стилей).
const PAD = ["pl-0", "pl-4", "pl-8", "pl-12", "pl-16", "pl-20"]

export function ArticleDictionary({
  kind,
  articles,
  basePath,
  showArchived,
  editing,
  createAction,
  updateAction,
  setActiveAction,
}: {
  kind: Kind
  articles: Row[]
  basePath: string
  showArchived: boolean
  editing?: EditingArticle
  createAction: (p: FormState, fd: FormData) => Promise<FormState>
  updateAction: (p: FormState, fd: FormData) => Promise<FormState>
  setActiveAction: (fd: FormData) => Promise<void>
}) {
  const nodes: ArticleNode[] = articles.map((a) => ({
    id: a.id,
    name: a.name,
    code: a.code,
    flow: a.flow,
    isGroup: a.isGroup,
    parentId: a.parentId,
  }))
  const rows = flattenArticleTree(buildArticleTree(nodes))
  const activeById = new Map(articles.map((a) => [a.id, a.isActive]))
  const groups: GroupOption[] = flattenArticleTree(
    buildArticleTree(nodes.filter((node) => node.isGroup))
  ).map((g) => ({ id: g.id, name: g.name, depth: g.depth }))
  const labels = FLOW_LABELS[kind]

  return (
    <div className="space-y-6">
      <ArticleForm
        kind={kind}
        action={editing ? updateAction : createAction}
        groups={groups}
        editing={editing}
        cancelHref={basePath + (showArchived ? "?archived=1" : "")}
      />

      <div className="flex justify-end">
        <Link
          href={basePath + (showArchived ? "" : "?archived=1")}
          className="text-sm text-primary underline underline-offset-4"
        >
          {showArchived ? "Скрыть архивные" : "Показать архивные"}
        </Link>
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Наименование</TableHead>
            <TableHead>Код</TableHead>
            <TableHead>Тип</TableHead>
            <TableHead className="text-right">Действия</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((r) => {
            const active = activeById.get(r.id) ?? true
            return (
              <TableRow key={r.id} className={active ? "" : "opacity-50"}>
                <TableCell>
                  <span
                    className={cn(
                      "inline-flex items-center",
                      PAD[Math.min(r.depth, PAD.length - 1)]
                    )}
                  >
                    {r.name}
                    {r.isGroup && (
                      <Badge variant="outline" className="ml-2">
                        группа
                      </Badge>
                    )}
                    {!active && (
                      <Badge variant="outline" className="ml-2">
                        архив
                      </Badge>
                    )}
                  </span>
                </TableCell>
                <TableCell>{r.code}</TableCell>
                <TableCell>
                  {r.flow ? (
                    <Badge variant="secondary">{labels[r.flow]}</Badge>
                  ) : null}
                </TableCell>
                <TableCell className="text-right">
                  <div className="flex justify-end gap-2">
                    <Link
                      href={`${basePath}?edit=${r.id}${showArchived ? "&archived=1" : ""}`}
                      className={buttonVariants({
                        variant: "ghost",
                        size: "sm",
                      })}
                    >
                      Изменить
                    </Link>
                    <form action={setActiveAction}>
                      <input type="hidden" name="id" value={r.id} />
                      <input
                        type="hidden"
                        name="active"
                        value={active ? "" : "1"}
                      />
                      <Button variant="ghost" size="sm" type="submit">
                        {active ? "В архив" : "Вернуть"}
                      </Button>
                    </form>
                  </div>
                </TableCell>
              </TableRow>
            )
          })}
        </TableBody>
      </Table>
    </div>
  )
}
