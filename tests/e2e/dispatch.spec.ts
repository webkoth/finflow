// tests/e2e/dispatch.spec.ts
// Отправка платёжек: настройки статей, очередь, ручной режим, mock-ЯМ.
// Serial: сценарии зависят от общего состояния черновика.
import { expect, test } from "@playwright/test"
import { loginAs, syncFixtureData } from "./helpers"

test.describe.configure({ mode: "serial" })

test("настройки статей: флаг переключается", async ({ page }) => {
  await loginAs(page, "accountant")
  await syncFixtureData(page) // наполняет справочник статей
  await page.goto("/settings/cash-flow-items")
  const row = page.getByRole("row", { name: /Реклама и продвижение/ })
  await row.getByRole("button", { name: "Пометить «за товар»" }).click()
  await expect(row.getByText("оплата за товар")).toBeVisible()
  await row.getByRole("button", { name: "Снять флаг" }).click()
  await expect(row.getByText("оплата за товар")).toHaveCount(0)
})
