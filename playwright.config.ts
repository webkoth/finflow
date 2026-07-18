import { defineConfig } from "@playwright/test"

export default defineConfig({
  testDir: "tests/e2e",
  timeout: 30_000,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  use: {
    baseURL: "http://localhost:3000",
    launchOptions: {
      // Чужой процесс может занимать [::1]:3000 (localhost сначала резолвится
      // в ::1) — браузер шёл бы не в то приложение. Мапим localhost на IPv4;
      // Origin остаётся localhost, что нужно same-origin-проверке next dev.
      args: ["--host-resolver-rules=MAP localhost 127.0.0.1"],
    },
  },
  webServer: {
    // В CI гоняем против production-сборки, локально — против dev-сервера
    command: process.env.CI ? "npm run build && npm run start" : "npm run dev",
    url: "http://127.0.0.1:3000",
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
  },
})
