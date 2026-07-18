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

test("ручной режим: файл + чат, ошибка mock, повтор, журнал", async ({
  page,
}) => {
  await loginAs(page, "accountant")
  await syncFixtureData(page)
  await page.goto("/dispatch")

  // Черновик REQ-0001 создан синком: не хватает файла и чата
  await expect(page.getByText("REQ-0001")).toBeVisible()
  await expect(
    page.getByText("не хватает: файл платёжки, чат поставщика")
  ).toBeVisible()

  // Прикрепляем файл
  await page.getByLabel("Файл платёжки для REQ-0001").setInputFiles({
    name: "p-0001.pdf",
    mimeType: "application/pdf",
    buffer: Buffer.from("%PDF-1.4 e2e"),
  })
  await page.getByRole("button", { name: "Прикрепить" }).click()
  await expect(page.getByText("📄 p-0001.pdf")).toBeVisible()

  // Чат с «падающим» mock-идентификатором → отправка даёт ошибку
  await page.getByLabel("Чат для REQ-0001").fill("mock-fail")
  await page.getByRole("button", { name: "Сохранить чат" }).click()
  await expect(page.getByText("готово к отправке")).toBeVisible()
  await page.getByRole("button", { name: "Отправить", exact: true }).click()
  await expect(page.getByText("ошибка: mock: чат недоступен")).toBeVisible()

  // Чиним чат и повторяем
  await page.getByLabel("Чат для REQ-0001").fill("mock-chat-1")
  await page.getByRole("button", { name: "Сохранить чат" }).click()
  await page.getByRole("button", { name: "Повторить" }).click()

  // Ушло в журнал с автором подтверждения
  // getByText("E2E Бухгалтер") неоднозначен: то же имя показывает шапка
  // (components/app-header.tsx) для залогиненного пользователя — уточняем
  // локатор до ячейки журнала.
  await expect(page.getByText("отправлено")).toBeVisible()
  await expect(page.getByRole("cell", { name: /E2E Бухгалтер/ })).toBeVisible()
})

test("viewer видит журнал, но не действия", async ({ page }) => {
  await loginAs(page, "viewer")
  await page.goto("/dispatch")
  await expect(
    page.getByRole("heading", { name: "Отправка платёжек" })
  ).toBeVisible()
  await expect(page.getByRole("button", { name: "Отправить" })).toHaveCount(0)
  await expect(page.getByRole("button", { name: "Прикрепить" })).toHaveCount(0)
})
