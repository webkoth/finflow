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

// Москва — фиксированный UTC+3 (без переходов с 2014 года).
const MOSCOW_OFFSET_MS = 3 * 60 * 60 * 1000

// Начало текущих московских суток в UTC (для фильтров «за сегодня»).
export function startOfMoscowDay(now: Date): Date {
  const shifted = new Date(now.getTime() + MOSCOW_OFFSET_MS)
  shifted.setUTCHours(0, 0, 0, 0)
  return new Date(shifted.getTime() - MOSCOW_OFFSET_MS)
}
