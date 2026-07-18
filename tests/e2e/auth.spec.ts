// tests/e2e/auth.spec.ts
import { expect, test } from "@playwright/test"
import { loginAs, syncFixtureData } from "./helpers"

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

test("без сессии несуществующий uid тоже ведёт на /login (нет оракула 404)", async ({
  page,
}) => {
  const response = await page.goto("/requests/nonexistent-uid-000")
  await expect(page).toHaveURL(/\/login/)
  expect(response?.status()).not.toBe(404)
})

// Кука есть, но не найдена в БД — middleware пропускает (проверяет только
// наличие куки), запрос доходит до страницы. Закрепляет собственно фикс
// порядка requirePageUser()/notFound() в app/requests/[uid]/page.tsx.
test("мёртвая кука + несуществующий uid — тоже /login, не 404", async ({
  browser,
  baseURL,
}) => {
  const ctx = await browser.newContext({ baseURL })
  await ctx.addCookies([
    {
      name: "finflow_session",
      value: "garbage-token-not-in-db",
      url: baseURL!,
    },
  ])
  const page = await ctx.newPage()
  const response = await page.goto("/requests/nonexistent-uid-000")
  await expect(page).toHaveURL(/\/login/)
  expect(response?.status()).not.toBe(404)
  await ctx.close()
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

test("viewer не видит согласование и форму комментария", async ({ page }) => {
  await loginAs(page, "viewer")
  await syncFixtureData(page)
  // Чекбоксов массового согласования нет ни у одной строки
  await expect(page.getByLabel(/Выбрать REQ-/)).toHaveCount(0)
  await page.getByRole("link", { name: "REQ-0004" }).click()
  await expect(page.getByRole("button", { name: "Согласовать" })).toHaveCount(0)
  await expect(
    page.getByRole("button", { name: "Добавить комментарий" })
  ).toHaveCount(0)
})

test("accountant: комментарий можно, согласование нельзя, настройки скрыты", async ({
  page,
}) => {
  await loginAs(page, "accountant")
  await syncFixtureData(page)
  await expect(page.getByText("Настройки светофора")).toHaveCount(0)
  await page.getByRole("link", { name: "REQ-0004" }).click()
  await expect(page.getByRole("button", { name: "Согласовать" })).toHaveCount(0)
  await expect(
    page.getByRole("button", { name: "Добавить комментарий" })
  ).toBeVisible()
})

test("не-owner получает 404 на настройках светофора", async ({ page }) => {
  await loginAs(page, "viewer")
  const response = await page.goto("/settings/verdict")
  expect(response?.status()).toBe(404)
})

test("смена пароля: старый перестаёт работать, новый работает", async ({
  page,
  browser,
}) => {
  await loginAs(page, "owner")
  await page.goto("/settings/users")
  const login = `e2e-pwd-${Date.now()}`
  await page.getByLabel("Логин", { exact: true }).fill(login)
  await page.getByLabel("Имя").fill("Смена Пароля")
  await page.getByLabel("Временный пароль").fill("old-password-1")
  await page.getByRole("button", { name: "Создать" }).click()
  await expect(page.getByText(login)).toBeVisible()

  const ctx = await browser.newContext()
  const p2 = await ctx.newPage()
  await p2.goto("/login")
  await p2.getByLabel("Логин").fill(login)
  await p2.getByLabel("Пароль").fill("old-password-1")
  await p2.getByRole("button", { name: "Войти" }).click()
  // Ждём завершения редиректа после логина — иначе goto ниже может
  // выполниться до того, как server action выставит cookie сессии.
  await expect(p2.getByRole("button", { name: "Выйти" })).toBeVisible()
  await p2.goto("/settings/password")
  await p2.getByLabel("Старый пароль").fill("old-password-1")
  await p2.getByLabel("Новый пароль", { exact: true }).fill("new-password-2")
  await p2.getByLabel("Новый пароль ещё раз").fill("new-password-2")
  await p2.getByRole("button", { name: "Сменить пароль" }).click()
  await expect(p2.getByText("Пароль изменён")).toBeVisible()
  await p2.getByRole("button", { name: "Выйти" }).click()

  // Старый пароль больше не работает
  await p2.getByLabel("Логин").fill(login)
  await p2.getByLabel("Пароль").fill("old-password-1")
  await p2.getByRole("button", { name: "Войти" }).click()
  await expect(p2.getByText("Неверный логин или пароль")).toBeVisible()
  // Новый — работает. Форма логина сбрасывает поля после неудачной
  // попытки (router.refresh() серверного action) — заполняем заново.
  await p2.getByLabel("Логин").fill(login)
  await p2.getByLabel("Пароль").fill("new-password-2")
  await p2.getByRole("button", { name: "Войти" }).click()
  await expect(p2.getByText("Смена Пароля")).toBeVisible()
  await ctx.close()
})
