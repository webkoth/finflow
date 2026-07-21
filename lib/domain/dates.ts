// Все даты в интерфейсе показываем в московском времени,
// независимо от таймзоны сервера.
export function formatDate(date: Date): string {
  return date.toLocaleDateString("ru-RU", { timeZone: "Europe/Moscow" })
}

// Москва — фиксированный UTC+3 (без переходов с 2014 года).
const MOSCOW_OFFSET_MS = 3 * 60 * 60 * 1000

// Начало текущих московских суток в UTC (для фильтров «за сегодня»).
export function startOfMoscowDay(now: Date): Date {
  const shifted = new Date(now.getTime() + MOSCOW_OFFSET_MS)
  shifted.setUTCHours(0, 0, 0, 0)
  return new Date(shifted.getTime() - MOSCOW_OFFSET_MS)
}
