"use server"

import {
  createArticleAction,
  setArticleActiveAction,
  updateArticleAction,
  type ArticleFormState,
} from "../article-actions"

const PATH = "/reference/pnl-items"

export async function createArticle(prev: ArticleFormState, fd: FormData) {
  return createArticleAction("PNL", PATH, prev, fd)
}
export async function updateArticle(prev: ArticleFormState, fd: FormData) {
  return updateArticleAction("PNL", PATH, prev, fd)
}
export async function setArticleActive(fd: FormData) {
  return setArticleActiveAction(PATH, fd)
}
