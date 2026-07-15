// lib/integrations/one-c.ts
// Запись в 1С: согласование/отклонение заявок (REST API, Bearer).
// ONEC_API_MODE: "real" — HTTP-вызовы; "mock" — успех без сети (dev/e2e);
// не задан/другое — явная ошибка (молчаливый mock в prod недопустим).
export type OneCResult = { ok: true } | { ok: false; error: string }

const TIMEOUT_MS = 10_000

async function post(path: string, body: unknown): Promise<OneCResult> {
  const mode = process.env.ONEC_API_MODE
  if (mode === "mock") return { ok: true }
  if (mode !== "real") {
    return { ok: false, error: "Интеграция с 1С не настроена (ONEC_API_MODE)" }
  }
  const base = process.env.ONEC_API_BASE_URL
  const token = process.env.ONEC_API_TOKEN
  if (!base || !token) {
    return {
      ok: false,
      error: "Не заданы ONEC_API_BASE_URL / ONEC_API_TOKEN",
    }
  }
  try {
    const res = await fetch(`${base}${path}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    })
    if (!res.ok) {
      return { ok: false, error: `1С ответила ошибкой: HTTP ${res.status}` }
    }
    return { ok: true }
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e)
    return { ok: false, error: `1С недоступна: ${message}` }
  }
}

export async function approveBids(uids: string[]): Promise<OneCResult> {
  return post("/api/1crm/post/approveBid", { bids: uids })
}

export async function declineBid(
  uid: string,
  comment: string
): Promise<OneCResult> {
  return post("/api/1crm/post/declineBid", {
    bids: [{ UID: uid, comment }],
  })
}
