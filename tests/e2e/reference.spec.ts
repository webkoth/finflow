import { expect, test } from "@playwright/test"

test("витрина справочников открывается", async ({ page }) => {
  await page.goto("/reference")
  await expect(page.getByRole("heading", { name: "Справочники" })).toBeVisible()
  await expect(page.getByRole("link", { name: "Статьи ДДС" })).toBeVisible()
})

test("ДДС: группа и вложенная статья появляются деревом", async ({ page }) => {
  await page.goto("/reference/cashflow-items")

  const group = `Группа-${Date.now()}`
  await page.getByLabel("Наименование").fill(group)
  await page.getByText("Это группа", { exact: true }).click()
  await page.getByRole("button", { name: "Добавить" }).click()
  await expect(page.getByRole("cell", { name: group })).toBeVisible()

  const item = `Статья-${Date.now()}`
  await page.getByLabel("Наименование").fill(item)
  await page.getByLabel("Тип").click()
  await page.getByRole("option", { name: "Выбытие" }).click()
  await page.getByLabel("Родитель").click()
  await page.getByRole("option", { name: group }).click()
  await page.getByRole("button", { name: "Добавить" }).click()
  await expect(page.getByRole("cell", { name: item })).toBeVisible()
})

test("ДДС: конечная статья без типа показывает ошибку", async ({ page }) => {
  await page.goto("/reference/cashflow-items")
  await page.getByLabel("Наименование").fill(`БезТипа-${Date.now()}`)
  await page.getByRole("button", { name: "Добавить" }).click()
  await expect(page.getByText("Укажите тип статьи")).toBeVisible()
})

test("банковский счёт создаётся и виден в списке", async ({ page }) => {
  await page.goto("/reference/bank-accounts")
  const name = `Счёт-${Date.now()}`
  await page.getByLabel("Название счёта").fill(name)
  await page.getByLabel("Номер счёта").fill("40702810900000009999")
  await page.getByLabel("Банк").fill("ПАО Сбербанк")
  await page.getByLabel("БИК").fill("044525225")
  await page.getByLabel("Валюта").fill("RUB")
  await page.getByLabel("Организация").fill("ООО Тест")
  await page.getByRole("button", { name: "Добавить" }).click()
  await expect(page.getByRole("cell", { name })).toBeVisible()
})

test("невалидный БИК показывает ошибку", async ({ page }) => {
  await page.goto("/reference/bank-accounts")
  await page.getByLabel("Название счёта").fill(`Счёт-${Date.now()}`)
  await page.getByLabel("Номер счёта").fill("40702810900000009999")
  await page.getByLabel("Банк").fill("Банк")
  await page.getByLabel("БИК").fill("123")
  await page.getByLabel("Валюта").fill("RUB")
  await page.getByLabel("Организация").fill("ООО Тест")
  await page.getByRole("button", { name: "Добавить" }).click()
  await expect(page.getByText("БИК — 9 цифр")).toBeVisible()
})
