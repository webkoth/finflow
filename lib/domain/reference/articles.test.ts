import { describe, expect, it } from "vitest"
import {
  buildArticleTree,
  flattenArticleTree,
  validateArticleInput,
  type ArticleNode,
} from "./articles"

const n = (o: Partial<ArticleNode> & { id: string }): ArticleNode => ({
  id: o.id,
  name: o.name ?? o.id,
  code: o.code ?? null,
  flow: o.flow ?? null,
  isGroup: o.isGroup ?? false,
  parentId: o.parentId ?? null,
})

describe("buildArticleTree", () => {
  it("вкладывает детей в родителя и проставляет глубину", () => {
    const tree = buildArticleTree([
      n({ id: "g", isGroup: true }),
      n({ id: "c", parentId: "g" }),
    ])
    expect(tree).toHaveLength(1)
    expect(tree[0].id).toBe("g")
    expect(tree[0].depth).toBe(0)
    expect(tree[0].children[0].id).toBe("c")
    expect(tree[0].children[0].depth).toBe(1)
  })

  it("сортирует соседей по коду (натурально), затем по имени", () => {
    const tree = buildArticleTree([
      n({ id: "b", code: "10", name: "Б" }),
      n({ id: "a", code: "2", name: "А" }),
    ])
    expect(tree.map((t) => t.id)).toEqual(["a", "b"])
  })

  it("узел без известного родителя становится корнем", () => {
    const tree = buildArticleTree([n({ id: "x", parentId: "missing" })])
    expect(tree.map((t) => t.id)).toEqual(["x"])
  })
})

describe("flattenArticleTree", () => {
  it("возвращает узлы в порядке обхода с глубиной", () => {
    const rows = flattenArticleTree(
      buildArticleTree([
        n({ id: "g", isGroup: true }),
        n({ id: "c", parentId: "g" }),
      ])
    )
    expect(rows.map((r) => [r.id, r.depth])).toEqual([
      ["g", 0],
      ["c", 1],
    ])
  })
})

describe("validateArticleInput", () => {
  const list = [
    n({ id: "g", isGroup: true }),
    n({ id: "leaf", flow: "INFLOW" }),
  ]

  it("требует наименование", () => {
    expect(
      validateArticleInput(
        { name: " ", isGroup: false, flow: "INFLOW", parentId: null },
        list
      )
    ).toMatch(/наименование/i)
  })
  it("требует тип у конечной статьи", () => {
    expect(
      validateArticleInput(
        { name: "X", isGroup: false, flow: null, parentId: null },
        list
      )
    ).toMatch(/тип/i)
  })
  it("разрешает группу без типа", () => {
    expect(
      validateArticleInput(
        { name: "X", isGroup: true, flow: null, parentId: null },
        list
      )
    ).toBeNull()
  })
  it("родителем может быть только группа", () => {
    expect(
      validateArticleInput(
        { name: "X", isGroup: false, flow: "INFLOW", parentId: "leaf" },
        list
      )
    ).toMatch(/группа/i)
  })
  it("отклоняет несуществующего родителя", () => {
    expect(
      validateArticleInput(
        { name: "X", isGroup: false, flow: "INFLOW", parentId: "nope" },
        list
      )
    ).toMatch(/не найден/i)
  })
  it("запрещает делать статью родителем самой себе", () => {
    expect(
      validateArticleInput(
        { name: "G", isGroup: true, flow: null, parentId: "g" },
        list,
        "g"
      )
    ).toMatch(/сам/i)
  })
  it("запрещает цикл (родитель — собственный потомок)", () => {
    const nested = [
      n({ id: "g", isGroup: true }),
      n({ id: "sub", isGroup: true, parentId: "g" }),
    ]
    expect(
      validateArticleInput(
        { name: "G", isGroup: true, flow: null, parentId: "sub" },
        nested,
        "g"
      )
    ).toMatch(/потомк|цикл/i)
  })
  it("возвращает null для корректной статьи", () => {
    expect(
      validateArticleInput(
        { name: "X", isGroup: false, flow: "OUTFLOW", parentId: "g" },
        list
      )
    ).toBeNull()
  })
})
