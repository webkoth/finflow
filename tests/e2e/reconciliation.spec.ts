import { expect, test } from "@playwright/test"
import { loginAs } from "./helpers"

// Смоук главного сценария: ручной прогон сверки создаёт запись в истории,
// экран деталей открывается и показывает счета. Данные создаёт сам тест
// (кнопка «Запустить сверку»), не полагаясь на seed-прогоны.
test("сверка: ручной прогон и просмотр результата", async ({ page }) => {
  await loginAs(page, "owner")
  await page.goto("/reconciliation")
  await expect(
    page.getByRole("heading", { name: "Сверка счётов" })
  ).toBeVisible()

  await page.getByRole("button", { name: "Запустить сверку" }).click()

  // После прогона появляется строка с датой-ссылкой на прогон.
  const runLink = page
    .getByRole("link")
    .filter({ hasText: /\d{2}\.\d{2}\.\d{4}/ })
    .first()
  await expect(runLink).toBeVisible()
  await runLink.click()

  await expect(
    page.getByRole("heading", { name: /Прогон сверки/ })
  ).toBeVisible()
  await expect(
    page.getByRole("heading", { name: "Счета", exact: true })
  ).toBeVisible()
})

test("сверка: колонка сверки на справочнике счётов", async ({ page }) => {
  await loginAs(page, "owner")
  await page.goto("/reference/bank-accounts")
  await expect(
    page.getByRole("heading", { name: "Банковские счета" })
  ).toBeVisible()
  await expect(page.getByRole("columnheader", { name: "Сверка" })).toBeVisible()
})
