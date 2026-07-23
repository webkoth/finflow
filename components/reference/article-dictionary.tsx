import Link from "next/link"
import {
  buildArticleTree,
  flattenArticleTree,
  type ArticleNode,
} from "@/lib/domain/reference/articles"
import { Badge } from "@/components/ui/badge"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { cn } from "@/lib/utils"
import { FLOW_LABELS } from "./article-labels"
import { GoodsToggle } from "./goods-toggle"

type Kind = "CASHFLOW" | "PNL"
type Row = ArticleNode & { isActive: boolean }

// Данные для колонки «Оплата за товар» (только справочник ДДС).
export type ArticleGoods = {
  canEdit: boolean
  byId: Record<string, boolean>
}

// Классы отступа по глубине (статические — Tailwind их видит; без инлайн-стилей).
const PAD = ["pl-0", "pl-4", "pl-8", "pl-12", "pl-16", "pl-20"]

export function ArticleDictionary({
  kind,
  articles,
  basePath,
  showArchived,
  goods,
}: {
  kind: Kind
  articles: Row[]
  basePath: string
  showArchived: boolean
  goods?: ArticleGoods
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
  const labels = FLOW_LABELS[kind]

  return (
    <div className="space-y-6">
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
            {goods && <TableHead>Оплата за товар</TableHead>}
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
                {goods && (
                  <TableCell>
                    {!r.isGroup && active && (
                      <GoodsToggle
                        articleId={r.id}
                        isGoods={goods.byId[r.id] ?? false}
                        canEdit={goods.canEdit}
                      />
                    )}
                  </TableCell>
                )}
              </TableRow>
            )
          })}
        </TableBody>
      </Table>
    </div>
  )
}
