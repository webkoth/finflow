"use server"

import {
  createArticleAction,
  setArticleActiveAction,
  updateArticleAction,
  type ArticleFormState,
} from "../article-actions"

const PATH = "/reference/cashflow-items"

export async function createArticle(prev: ArticleFormState, fd: FormData) {
  return createArticleAction("CASHFLOW", PATH, prev, fd)
}
export async function updateArticle(prev: ArticleFormState, fd: FormData) {
  return updateArticleAction("CASHFLOW", PATH, prev, fd)
}
export async function setArticleActive(fd: FormData) {
  return setArticleActiveAction(PATH, fd)
}
