import { defineConfig } from "@playwright/test"

// Порт e2e-сервера. На машинах команды на :3000 часто живёт чужой dev-сервер
// (другая сессия/проект) — reuseExistingServer молча переиспользовал бы его.
// Локально задавай выделенный порт: E2E_PORT=3005 npm run test:e2e.
const port = process.env.E2E_PORT ?? "3000"

export default defineConfig({
  testDir: "tests/e2e",
  timeout: 30_000,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  use: {
    baseURL: `http://localhost:${port}`,
    launchOptions: {
      // Чужой процесс может занимать [::1]:3000 (localhost сначала резолвится
      // в ::1) — браузер шёл бы не в то приложение. Мапим localhost на IPv4;
      // Origin остаётся localhost, что нужно same-origin-проверке next dev.
      args: ["--host-resolver-rules=MAP localhost 127.0.0.1"],
    },
  },
  webServer: {
    // В CI гоняем против production-сборки, локально — против dev-сервера
    command: process.env.CI
      ? `npm run build && PORT=${port} npm run start`
      : `PORT=${port} npm run dev`,
    url: `http://127.0.0.1:${port}`,
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
  },
})
