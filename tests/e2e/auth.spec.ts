// tests/e2e/auth.spec.ts
import { expect, test } from "@playwright/test"
import { loginAs } from "./helpers"

test("неавторизованный редиректится на /login и возвращается после входа", async ({
  page,
}) => {
  await page.goto("/requests")
  await expect(page).toHaveURL(/\/login\?callbackUrl=%2Frequests/)
  // Входим прямо на редиректнутой странице — callbackUrl должен вернуть назад
  await page.getByLabel("Логин").fill("e2e-owner")
  await page.getByLabel("Пароль").fill("e2e-owner-password")
  await page.getByRole("button", { name: "Войти" }).click()
  await expect(page).toHaveURL(/\/requests/)
  await expect(
    page.getByRole("heading", { name: "Заявки на оплату" })
  ).toBeVisible()
})

test("неверный пароль — одно общее сообщение", async ({ page }) => {
  await page.goto("/login")
  await page.getByLabel("Логин").fill("e2e-owner")
  await page.getByLabel("Пароль").fill("wrong-password")
  await page.getByRole("button", { name: "Войти" }).click()
  await expect(page.getByText("Неверный логин или пароль")).toBeVisible()
})

test("вход и выход", async ({ page }) => {
  await loginAs(page, "viewer")
  await expect(page.getByText("E2E Читатель")).toBeVisible()
  // exact: true — иначе строка матчит и имя «E2E Читатель» (strict mode)
  await expect(page.getByText("Читатель", { exact: true })).toBeVisible()
  await page.getByRole("button", { name: "Выйти" }).click()
  await expect(page).toHaveURL(/\/login/)
})

test("owner создаёт пользователя — тот входит", async ({ page, browser }) => {
  await loginAs(page, "owner")
  await page.goto("/settings/users")
  const login = `e2e-tmp-${Date.now()}`
  await page.getByLabel("Логин", { exact: true }).fill(login)
  await page.getByLabel("Имя").fill("Временный Тест")
  await page.getByLabel("Временный пароль").fill("temp-password-1")
  await page.getByRole("button", { name: "Создать" }).click()
  await expect(page.getByText(login)).toBeVisible()

  const ctx = await browser.newContext()
  const page2 = await ctx.newPage()
  await page2.goto("/login")
  await page2.getByLabel("Логин").fill(login)
  await page2.getByLabel("Пароль").fill("temp-password-1")
  await page2.getByRole("button", { name: "Войти" }).click()
  await expect(page2.getByText("Временный Тест")).toBeVisible()
  await ctx.close()
})

test("не-owner не видит страницу пользователей (404)", async ({ page }) => {
  await loginAs(page, "accountant")
  const response = await page.goto("/settings/users")
  expect(response?.status()).toBe(404)
})
