// lib/domain/dispatch.ts
// Готовность черновика отправки платёжки (спека §8): отправлять можно,
// когда есть и файл, и идентификатор чата. Чистая логика без I/O.
export type DispatchReadiness = {
  status: "awaiting_confirmation" | "not_ready"
  missing: string[]
}

export function computeDispatchReadiness(input: {
  hasFile: boolean
  hasChatId: boolean
}): DispatchReadiness {
  const missing: string[] = []
  if (!input.hasFile) missing.push("файл платёжки")
  if (!input.hasChatId) missing.push("чат поставщика")
  return {
    status: missing.length === 0 ? "awaiting_confirmation" : "not_ready",
    missing,
  }
}
