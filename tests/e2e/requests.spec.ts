import { expect, test } from "@playwright/test"
import { loginAs, syncFixtureData } from "./helpers"

test("реестр: синк наполняет таблицу, статусы подсвечены", async ({ page }) => {
  await loginAs(page, "owner")
  await syncFixtureData(page)
  await expect(page.getByText("Исполнена")).toBeVisible()
  await expect(page.getByText("Просрочена")).toBeVisible()
  await expect(page.getByText("Данные на")).toBeVisible()
})

test("реестр: фильтр «Красные» оставляет только просроченные", async ({
  page,
}) => {
  await loginAs(page, "owner")
  await syncFixtureData(page)
  await page.getByText("Красные", { exact: true }).click()
  await expect(page.getByRole("link", { name: "REQ-0002" })).toBeVisible()
  await expect(page.getByRole("link", { name: "REQ-0001" })).toHaveCount(0)
})

test("карточка: исполненная заявка показывает списание", async ({ page }) => {
  await loginAs(page, "owner")
  await syncFixtureData(page)
  await page.getByRole("link", { name: "REQ-0001" }).click()
  await expect(
    page.getByRole("heading", { name: "Заявка REQ-0001" })
  ).toBeVisible()
  await expect(page.getByText("Исполнена: списание")).toBeVisible()
  // exact: true — с секцией «Ликвидность» (задача 9) на карточке появились
  // и другие остатки с «Сбербанк ₽» в названии счёта; тут проверяем именно
  // банк списания в таблице исполнения.
  await expect(
    page.getByRole("cell", { name: "Сбербанк", exact: true })
  ).toBeVisible()
})

test("карточка: несуществующий uid отдаёт 404", async ({ page }) => {
  await loginAs(page, "owner")
  const response = await page.goto("/requests/no-such-uid")
  expect(response?.status()).toBe(404)
})

test("комментарий бухгалтера сохраняется и виден на карточке", async ({
  page,
}) => {
  await loginAs(page, "accountant")
  await syncFixtureData(page)
  await page.getByRole("link", { name: "REQ-0002" }).click()
  const text = `Ждём деньги от маркетплейса, оплатим позже — e2e-${Date.now()}`
  await page.getByLabel("Комментарий").fill(text)
  await page.getByRole("button", { name: "Добавить комментарий" }).click()
  await expect(page.getByText(text)).toBeVisible()
  // Имя есть и в шапке — проверяем автора внутри элемента комментария
  const comment = page.locator("li", { hasText: text })
  await expect(comment).toContainText("E2E Бухгалтер")
})

test("согласование заявки меняет статус (mock 1С)", async ({ page }) => {
  await loginAs(page, "owner")
  await syncFixtureData(page) // синк возвращает fixture-статусы, тест повторяем
  await page.getByRole("link", { name: "REQ-0004" }).click()
  await page.getByRole("button", { name: "Согласовать" }).click()
  await expect(page.getByText("Ждёт оплаты")).toBeVisible()
  await expect(page.getByRole("button", { name: "Согласовать" })).toHaveCount(0)
})

test("отклонение без причины показывает ошибку", async ({ page }) => {
  await loginAs(page, "owner")
  await syncFixtureData(page)
  await page.getByRole("link", { name: "REQ-0006" }).click()
  // required-атрибут не даст отправить пустую форму — проверяем серверную
  // валидацию через пробел
  await page.getByLabel("Причина отклонения").fill(" ")
  await page.getByRole("button", { name: "Отклонить" }).click()
  await expect(page.getByText("Укажите причину отклонения")).toBeVisible()
})

test("отклонение заявки с причиной меняет статус (mock 1С)", async ({
  page,
}) => {
  await loginAs(page, "owner")
  await syncFixtureData(page)
  await page.getByRole("link", { name: "REQ-0006" }).click()
  await page.getByLabel("Причина отклонения").fill("Дубликат заявки — e2e")
  await page.getByRole("button", { name: "Отклонить" }).click()
  await expect(page.getByText("Отклонена", { exact: true })).toBeVisible()
  await expect(page.getByRole("button", { name: "Отклонить" })).toHaveCount(0)
})

test("массовое согласование выбранных заявок (mock 1С)", async ({ page }) => {
  await loginAs(page, "owner")
  await syncFixtureData(page)
  // Чекбоксы только у зелёных: REQ-0006 (🟡) и REQ-0007 (🔴) недоступны.
  await expect(page.getByLabel("Выбрать REQ-0006")).toHaveCount(0)
  await expect(page.getByLabel("Выбрать REQ-0007")).toHaveCount(0)
  await page.getByLabel("Выбрать REQ-0004").check()
  await page
    .getByRole("button", { name: "Согласовать выбранные (только 🟢)" })
    .click()
  await expect(page.getByLabel("Выбрать REQ-0004")).toHaveCount(0)
})
