// lib/integrations/yandex-messenger.ts
// Отправка файла платёжки в чат поставщика (Bot API Яндекс Мессенджера).
// YM_BOT_MODE: "mock" — без сети (dev/e2e; chatId "mock-fail" → ошибка,
// для e2e сценария повтора); "real" — HTTP; иначе — явная ошибка.
// Формат real-вызова зафиксирован в docs/contracts/yandex-messenger.md
// и проверяется при появлении бота (предпосылка §11.3 спеки).
import { readFile } from "node:fs/promises"

export type SendResult = { ok: true } | { ok: false; error: string }

const TIMEOUT_MS = 30_000
const API_URL = "https://botapi.messenger.yandex.net/bot/v1/messages/sendFile/"

export async function sendPaymentOrder(input: {
  chatId: string
  filePath: string
  fileName: string
  caption: string
}): Promise<SendResult> {
  const mode = process.env.YM_BOT_MODE
  if (mode === "mock") {
    if (input.chatId === "mock-fail")
      return { ok: false, error: "mock: чат недоступен" }
    return { ok: true }
  }
  if (mode !== "real")
    return {
      ok: false,
      error: "Интеграция с Яндекс Мессенджером не настроена (YM_BOT_MODE)",
    }

  const token = process.env.YM_BOT_TOKEN
  if (!token) return { ok: false, error: "Не задан YM_BOT_TOKEN" }

  try {
    const bytes = await readFile(input.filePath)
    const form = new FormData()
    form.set("chat_id", input.chatId)
    form.set("text", input.caption)
    form.set("document", new Blob([new Uint8Array(bytes)]), input.fileName)
    const res = await fetch(API_URL, {
      method: "POST",
      headers: { Authorization: `OAuth ${token}` },
      body: form,
      signal: AbortSignal.timeout(TIMEOUT_MS),
    })
    if (!res.ok)
      return { ok: false, error: `Мессенджер ответил HTTP ${res.status}` }
    return { ok: true }
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e)
    return { ok: false, error: `Мессенджер недоступен: ${message}` }
  }
}
