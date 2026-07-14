// Все даты в интерфейсе показываем в московском времени,
// независимо от таймзоны сервера.
export function formatDate(date: Date): string {
  return date.toLocaleDateString("ru-RU", { timeZone: "Europe/Moscow" })
}
