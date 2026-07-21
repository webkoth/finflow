import { defineConfig } from "@playwright/test"

export default defineConfig({
  testDir: "tests/e2e",
  // Локально dev-сервер компилирует каждый маршрут при первом обращении:
  // замерено 13,8 с на холодную против 0,35 с на тёплую, а при клиентском
  // переходе Next держит старую страницу до готовности новой — тест, который
  // первым открывает карточку заявки, всё это время ждёт. Со стандартными 5 с
  // он падал. В CI прогон идёт против production-сборки, компиляции нет —
  // там держим строгие таймауты, чтобы настоящие подвисания не проскакивали.
  timeout: process.env.CI ? 30_000 : 120_000,
  expect: { timeout: process.env.CI ? 5_000 : 60_000 },
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  use: { baseURL: "http://localhost:3000" },
  webServer: {
    // В CI гоняем против production-сборки, локально — против dev-сервера
    command: process.env.CI ? "npm run build && npm run start" : "npm run dev",
    url: "http://localhost:3000",
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
  },
})
