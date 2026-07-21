import { expect, test } from "@playwright/test"
import { loginAs } from "./helpers"

test("дашборд: карточки, график и таблица на месте", async ({ page }) => {
  await loginAs(page, "owner")
  await page.goto("/")
  await expect(page.getByRole("heading", { name: "Дашборд" })).toBeVisible()
  await expect(page.getByText("На счетах")).toBeVisible()
  await expect(page.getByText("На согласовании")).toBeVisible()
  await expect(page.getByText("К оплате")).toBeVisible()
  await expect(page.getByText("Платёжки", { exact: true })).toBeVisible()
  await expect(page.getByText("Движение денег")).toBeVisible()
  await expect(page.getByText("Остатки по счетам")).toBeVisible()
})

test("график наполняется созданной транзакцией", async ({ page }) => {
  await loginAs(page, "owner")
  await page.goto("/transactions")
  await page.getByLabel("Категория").fill("Тест дашборда")
  await page.getByLabel("Сумма").fill("321,00")
  await page.getByRole("button", { name: "Добавить" }).click()
  await expect(page.getByText("Тест дашборда").first()).toBeVisible()

  await page.goto("/")
  await expect(page.getByText("Нет операций за период")).toBeHidden()
})

test("сайдбар: группы видны, переход подсвечивает раздел", async ({ page }) => {
  await loginAs(page, "owner")
  await page.goto("/")
  for (const label of ["Обзор", "Операции", "Справочники", "Настройки"]) {
    // Группа "Справочники" содержит единственный пункт с тем же названием —
    // getByText неоднозначен (лейбл группы + ссылка пункта), поэтому берём
    // именно лейбл группы по data-slot из components/ui/sidebar.tsx.
    await expect(
      page.locator('[data-slot="sidebar-group-label"]', { hasText: label })
    ).toBeVisible()
  }
  await page.getByRole("link", { name: "Транзакции" }).click()
  await expect(page).toHaveURL(/\/transactions/)
  await expect(page.getByRole("heading", { name: "Транзакции" })).toBeVisible()
})

test("читатель не видит группу «Настройки»", async ({ page }) => {
  await loginAs(page, "viewer")
  await page.goto("/")
  await expect(page.getByRole("heading", { name: "Дашборд" })).toBeVisible()
  await expect(page.getByText("Настройки", { exact: true })).toBeHidden()
  await expect(page.getByRole("link", { name: "Пользователи" })).toBeHidden()
})
