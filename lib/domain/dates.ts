// Все даты в интерфейсе показываем в московском времени,
// независимо от таймзоны сервера.
export function formatDate(date: Date): string {
  return date.toLocaleDateString("ru-RU", { timeZone: "Europe/Moscow" })
}

// Дата со временем — для отметки «обновлено …» в справочниках.
export function formatDateTime(date: Date): string {
  return date.toLocaleString("ru-RU", {
    timeZone: "Europe/Moscow",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  })
}
