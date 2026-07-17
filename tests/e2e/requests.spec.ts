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
  // exact: true — с секцией «Ликвидность» (задача 9) на карточке появились
  // и другие остатки с «Сбербанк ₽» в названии счёта; тут проверяем именно
  // банк списания в таблице исполнения.
  await expect(
    page.getByRole("cell", { name: "Сбербанк", exact: true })
  ).toBeVisible()
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

test("согласование заявки меняет статус (mock 1С)", async ({ page }) => {
  await syncFixtureData(page) // синк возвращает fixture-статусы, тест повторяем
  await page.getByRole("link", { name: "REQ-0004" }).click()
  await page.getByRole("button", { name: "Согласовать" }).click()
  await expect(page.getByText("Ждёт оплаты")).toBeVisible()
  await expect(page.getByRole("button", { name: "Согласовать" })).toHaveCount(0)
})

test("отклонение без причины показывает ошибку", async ({ page }) => {
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
  await syncFixtureData(page)
  await page.getByRole("link", { name: "REQ-0006" }).click()
  await page.getByLabel("Причина отклонения").fill("Дубликат заявки — e2e")
  await page.getByRole("button", { name: "Отклонить" }).click()
  await expect(page.getByText("Отклонена", { exact: true })).toBeVisible()
  await expect(page.getByRole("button", { name: "Отклонить" })).toHaveCount(0)
})

test("массовое согласование выбранных заявок (mock 1С)", async ({ page }) => {
  await syncFixtureData(page)
  await page.getByLabel("Выбрать REQ-0004").check()
  await page.getByLabel("Выбрать REQ-0006").check()
  await page.getByLabel("Выбрать REQ-0007").check()
  await page.getByRole("button", { name: "Согласовать выбранные" }).click()
  await expect(
    page.getByRole("button", { name: "Согласовать выбранные" })
  ).toHaveCount(0) // заявок on_approval не осталось
})
