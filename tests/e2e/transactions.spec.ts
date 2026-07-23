import { expect, test } from "@playwright/test"
import { loginAs } from "./helpers"

test("страница транзакций открывается", async ({ page }) => {
  await loginAs(page, "owner")
  await page.goto("/transactions")
  await expect(page.getByRole("heading", { name: "Транзакции" })).toBeVisible()
  await expect(page.getByLabel("Категория")).toBeVisible()
  await expect(page.getByRole("button", { name: "Добавить" })).toBeVisible()
})

test("новая транзакция появляется в списке", async ({ page }) => {
  await loginAs(page, "owner")
  await page.goto("/transactions")
  const note = `e2e-${Date.now()}`
  await page.getByLabel("Категория").fill("Тест")
  await page.getByLabel("Сумма").fill("123,45")
  await page.getByLabel("Заметка").fill(note)
  await page.getByRole("button", { name: "Добавить" }).click()
  await expect(page.getByText(note)).toBeVisible()
})

test("невалидная сумма показывает ошибку, страница не падает", async ({
  page,
}) => {
  await loginAs(page, "owner")
  await page.goto("/transactions")
  await page.getByLabel("Категория").fill("Тест")
  await page.getByLabel("Сумма").fill("0")
  await page.getByRole("button", { name: "Добавить" }).click()
  await expect(
    page.getByText("Сумма должна быть ненулевым числом до 21,4 млн ₽")
  ).toBeVisible()
  await expect(page.getByRole("heading", { name: "Транзакции" })).toBeVisible()
})
