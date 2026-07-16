// Чистая логика справочника статей: дерево и валидация. Без React и Prisma.

export type ArticleFlow = "INFLOW" | "OUTFLOW"

export type ArticleNode = {
  id: string
  name: string
  code: string | null
  flow: ArticleFlow | null
  isGroup: boolean
  parentId: string | null
}

export type ArticleTreeNode = ArticleNode & {
  depth: number
  children: ArticleTreeNode[]
}

export type ArticleInput = {
  name: string
  isGroup: boolean
  flow: ArticleFlow | null
  parentId: string | null
}

function compareNodes(a: ArticleNode, b: ArticleNode): number {
  if (a.code && b.code) {
    const r = a.code.localeCompare(b.code, "ru", { numeric: true })
    if (r !== 0) return r
  } else if (a.code && !b.code) {
    return -1
  } else if (!a.code && b.code) {
    return 1
  }
  return a.name.localeCompare(b.name, "ru")
}

export function buildArticleTree(items: ArticleNode[]): ArticleTreeNode[] {
  const byId = new Map<string, ArticleTreeNode>()
  for (const it of items) byId.set(it.id, { ...it, depth: 0, children: [] })

  const roots: ArticleTreeNode[] = []
  for (const node of byId.values()) {
    const parent = node.parentId ? byId.get(node.parentId) : undefined
    if (parent) parent.children.push(node)
    else roots.push(node)
  }

  const sortRec = (nodes: ArticleTreeNode[], depth: number) => {
    nodes.sort(compareNodes)
    for (const node of nodes) {
      node.depth = depth
      sortRec(node.children, depth + 1)
    }
  }
  sortRec(roots, 0)
  return roots
}

export function flattenArticleTree(
  roots: ArticleTreeNode[]
): ArticleTreeNode[] {
  const out: ArticleTreeNode[] = []
  const walk = (nodes: ArticleTreeNode[]) => {
    for (const node of nodes) {
      out.push(node)
      walk(node.children)
    }
  }
  walk(roots)
  return out
}

// Возвращает текст ошибки или null. allSameKind — все статьи того же kind
// (для проверки родителя и защиты от циклов). selfId — id редактируемой статьи.
export function validateArticleInput(
  input: ArticleInput,
  allSameKind: ArticleNode[],
  selfId?: string
): string | null {
  if (!input.name.trim()) return "Укажите наименование"
  if (!input.isGroup && !input.flow) return "Укажите тип статьи"

  if (input.parentId) {
    if (input.parentId === selfId)
      return "Статья не может быть родителем самой себе"
    const byId = new Map(allSameKind.map((a) => [a.id, a]))
    const parent = byId.get(input.parentId)
    if (!parent) return "Родитель не найден"
    if (!parent.isGroup) return "Родителем может быть только группа"

    if (selfId) {
      let cur: ArticleNode | undefined = parent
      while (cur) {
        if (cur.id === selfId)
          return "Нельзя переместить статью внутрь её потомка"
        cur = cur.parentId ? byId.get(cur.parentId) : undefined
      }
    }
  }
  return null
}
