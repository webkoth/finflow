// Doctor: проверка окружения специалиста finflow.
// Запуск: node scripts/onboarding-check.mjs
// Без внешних зависимостей, работает на Windows/macOS/Linux.

import { execSync } from "node:child_process"
import { existsSync, readFileSync } from "node:fs"
import { homedir } from "node:os"
import { join } from "node:path"

const results = []

function run(cmd) {
  return execSync(cmd, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim()
}

function check(name, fn, { warnOnly = false, hint = "" } = {}) {
  try {
    const detail = fn()
    results.push({ name, status: "PASS", detail: detail || "" })
  } catch (e) {
    results.push({
      name,
      status: warnOnly ? "WARN" : "FAIL",
      detail: hint || String(e.message || e).split("\n")[0].slice(0, 80),
    })
  }
}

check("Node.js >= 26", () => {
  const major = Number(process.versions.node.split(".")[0])
  if (major < 26) throw new Error(`установлен ${process.versions.node}`)
  return `v${process.versions.node}`
})

check("git установлен", () => run("git --version"))

check("git-идентичность настроена", () => {
  const name = run("git config user.name")
  const email = run("git config user.email")
  if (!name || !email) throw new Error("нет user.name/user.email")
  return `${name} <${email}>`
})

check("psql (PostgreSQL) установлен", () => run("psql --version"))

check(".env с DATABASE_URL", () => {
  if (!existsSync(".env")) throw new Error(".env не найден (cp .env.example .env)")
  const env = readFileSync(".env", "utf8")
  if (!/^DATABASE_URL=/m.test(env)) throw new Error("в .env нет DATABASE_URL")
  return "есть"
})

check("Миграции применены к локальной БД", () => {
  const out = run("npx prisma migrate status")
  if (!/up to date/i.test(out)) throw new Error("prisma migrate status: есть неприменённые миграции")
  return "схема актуальна"
})

check(
  "GitHub CLI авторизован",
  () => {
    run("gh auth status")
    return run("gh api user -q .login")
  },
  { hint: "выполни: gh auth login" },
)

check(
  "Право push в webkoth/finflow",
  () => {
    const ok = run("gh api repos/webkoth/finflow --jq .permissions.push")
    if (ok !== "true") throw new Error("нет права push")
    return "write-доступ есть"
  },
  { warnOnly: true, hint: "разработчик ещё не выдал доступ (сообщи ему свой логин)" },
)

check(
  "Ключ машины для опер-режима",
  () => {
    const key = join(homedir(), ".ssh", "finflow_ed25519")
    if (!existsSync(key)) throw new Error("нет ~/.ssh/finflow_ed25519")
    return "есть"
  },
  { warnOnly: true, hint: "шаг 7 команды /onboarding (у разработчика — свой ключ)" },
)

check(
  "SSH-доступ к серверу (ops)",
  () => run("ssh -o BatchMode=yes -o ConnectTimeout=7 finflow-ops echo ok"),
  { warnOnly: true, hint: "разработчик ещё не добавил твой ключ на сервер" },
)

const width = Math.max(...results.map((r) => r.name.length)) + 2
let failed = 0
console.log("\n=== finflow onboarding check ===\n")
for (const r of results) {
  if (r.status === "FAIL") failed++
  const icon = r.status === "PASS" ? "✅" : r.status === "WARN" ? "⚠️ " : "❌"
  console.log(`${icon} ${r.status.padEnd(5)} ${r.name.padEnd(width)} ${r.detail}`)
}
console.log(
  failed
    ? `\nЕсть проблемы (${failed}). Исправь ❌ и запусти проверку снова.`
    : "\nВсё готово. ⚠️ -пункты закрывает разработчик выдачей доступов.",
)
process.exit(failed ? 1 : 0)
