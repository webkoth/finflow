import { expect, type Page } from "@playwright/test"

// Материализует fixture-данные через реальный конвейер: кнопка «Обновить»
// на реестре запускает синк fixture-шлюза (DWH_MODE=fixture в .env).
export async function syncFixtureData(page: Page) {
  await page.goto("/requests")
  await page.getByRole("button", { name: "Обновить" }).click()
  await expect(page.getByRole("link", { name: "REQ-0001" })).toBeVisible()
}

export const E2E_USERS = {
  owner: { login: "e2e-owner", password: "e2e-owner-password" },
  accountant: { login: "e2e-accountant", password: "e2e-accountant-password" },
  viewer: { login: "e2e-viewer", password: "e2e-viewer-password" },
} as const

// Вход seed-пользователем. Требует npx prisma db seed перед прогоном e2e.
export async function loginAs(page: Page, role: keyof typeof E2E_USERS) {
  await page.goto("/login")
  await page.getByLabel("Логин").fill(E2E_USERS[role].login)
  await page.getByLabel("Пароль").fill(E2E_USERS[role].password)
  await page.getByRole("button", { name: "Войти" }).click()
  await expect(page.getByRole("button", { name: "Выйти" })).toBeVisible()
}
