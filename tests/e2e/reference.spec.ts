import { expect, test } from "@playwright/test"
import { loginAs } from "./helpers"

// Разделы требуют авторизации (спека auth-roles). Входим владельцем —
// у него максимум прав, поэтому «редактирование недоступно» проверяется
// в самом строгом случае: форм нет даже у того, кто иначе имел бы manage_reference.
test.beforeEach(async ({ page }) => {
  await loginAs(page, "owner")
})

// Данные готовит сам тест: кнопка «Обновить из 1С» прогоняет синк
// fixture-шлюза (ONEC_ODATA_MODE=fixture в .env), от seed тест не зависит.
test("ДДС: справочник наполняется из 1С и показывается деревом", async ({
  page,
}) => {
  await page.goto("/reference/cashflow-items")
  await page.getByRole("button", { name: "Обновить из 1С" }).click()

  await expect(
    page.getByRole("cell", { name: "Операционная деятельность" })
  ).toBeVisible()
  await expect(
    page.getByRole("cell", { name: "Поступления от покупателей" })
  ).toBeVisible()
  await expect(page.getByText(/Данные из 1С, обновлено/)).toBeVisible()
})

test("ДДС: редактирование недоступно — источник истины в 1С", async ({
  page,
}) => {
  await page.goto("/reference/cashflow-items")
  await expect(page.getByRole("button", { name: "Добавить" })).toHaveCount(0)
  await expect(page.getByRole("link", { name: "Изменить" })).toHaveCount(0)
  await expect(page.getByRole("button", { name: "В архив" })).toHaveCount(0)
})

test("ДДС: помеченная удалённой в 1С не попадает в справочник", async ({
  page,
}) => {
  await page.goto("/reference/cashflow-items")
  await page.getByRole("button", { name: "Обновить из 1С" }).click()
  await expect(
    page.getByRole("cell", { name: "Устаревшая статья" })
  ).toHaveCount(0)

  // И в архиве её тоже нет: запись с пометкой удаления не заводится вовсе,
  // архивируются только те, что успели приехать активными (см. sync-diff.test.ts).
  await page.getByRole("link", { name: "Показать архивные" }).click()
  await expect(
    page.getByRole("cell", { name: "Устаревшая статья" })
  ).toHaveCount(0)
})

test("ДДС: флаг «оплата за товар» переключается", async ({ page }) => {
  await page.goto("/reference/cashflow-items")
  await page.getByRole("button", { name: "Обновить из 1С" }).click()

  // Нейтральная конечная статья: её флаг ни на что больше не влияет,
  // тест возвращает состояние как было (выкл).
  const row = page.getByRole("row", { name: /Кредиты и займы/ })
  await row.getByRole("button", { name: "Пометить «за товар»" }).click()
  await expect(row.getByText("оплата за товар")).toBeVisible()
  await row.getByRole("button", { name: "Снять флаг" }).click()
  await expect(row.getByText("оплата за товар")).toHaveCount(0)
})

test("банковские счета наполняются из 1С", async ({ page }) => {
  await page.goto("/reference/bank-accounts")
  await page.getByRole("button", { name: "Обновить из 1С" }).click()
  await expect(
    page.getByRole("cell", { name: "Расчётный счёт Сбербанк" })
  ).toBeVisible()
  await expect(page.getByRole("cell", { name: "044525225" })).toBeVisible()
})

test("витрина справочников открывается", async ({ page }) => {
  await page.goto("/reference")
  await expect(page.getByRole("heading", { name: "Справочники" })).toBeVisible()
  await expect(page.getByRole("link", { name: "Статьи ДДС" })).toBeVisible()
})
