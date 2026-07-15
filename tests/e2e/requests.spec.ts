import { expect, test } from "@playwright/test"
import { syncFixtureData } from "./helpers"

test("реестр: синк наполняет таблицу, статусы подсвечены", async ({ page }) => {
  await syncFixtureData(page)
  await expect(page.getByText("Исполнена")).toBeVisible()
  await expect(page.getByText("Просрочена")).toBeVisible()
  await expect(page.getByText("Данные на")).toBeVisible()
})

test("реестр: фильтр «Красные» оставляет только просроченные", async ({
  page,
}) => {
  await syncFixtureData(page)
  await page.getByText("Красные", { exact: true }).click()
  await expect(page.getByRole("link", { name: "REQ-0002" })).toBeVisible()
  await expect(page.getByRole("link", { name: "REQ-0001" })).toHaveCount(0)
})

test("карточка: исполненная заявка показывает списание", async ({ page }) => {
  await syncFixtureData(page)
  await page.getByRole("link", { name: "REQ-0001" }).click()
  await expect(
    page.getByRole("heading", { name: "Заявка REQ-0001" })
  ).toBeVisible()
  await expect(page.getByText("Исполнена: списание")).toBeVisible()
  await expect(page.getByText("Сбербанк")).toBeVisible()
})

test("карточка: несуществующий uid отдаёт 404", async ({ page }) => {
  const response = await page.goto("/requests/no-such-uid")
  expect(response?.status()).toBe(404)
})

test("комментарий бухгалтера сохраняется и виден на карточке", async ({
  page,
}) => {
  await syncFixtureData(page)
  await page.getByRole("link", { name: "REQ-0002" }).click()
  const text = `Ждём деньги от маркетплейса, оплатим позже — e2e-${Date.now()}`
  await page.getByLabel("Автор").fill("Бухгалтер Е2Е")
  await page.getByLabel("Комментарий").fill(text)
  await page.getByRole("button", { name: "Добавить комментарий" }).click()
  await expect(page.getByText(text)).toBeVisible()
})
