import { expect, type Page } from "@playwright/test"

// Материализует fixture-данные через реальный конвейер: кнопка «Обновить»
// на реестре запускает синк fixture-шлюза (DWH_MODE=fixture в .env).
export async function syncFixtureData(page: Page) {
  await page.goto("/requests")
  await page.getByRole("button", { name: "Обновить" }).click()
  await expect(page.getByRole("link", { name: "REQ-0001" })).toBeVisible()
}
