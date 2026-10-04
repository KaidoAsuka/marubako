export function toDateKey(date: Date): string {
  const year = date.getFullYear()
  const month = `${date.getMonth() + 1}`.padStart(2, '0')
  const day = `${date.getDate()}`.padStart(2, '0')
  return `${year}-${month}-${day}`
}

export function todayKey(): string {
  return toDateKey(new Date())
}

export function parseDateKey(value: string): Date {
  return new Date(`${value}T00:00:00`)
}

const MIN_DATE_YEAR = 2000
const MAX_DATE_YEAR = 2100

/**
 * True for a canonical "YYYY-MM-DD" key of a real day in 2000-2100. Anything else (a half-typed
 * year such as "0026-10-05" or "20271-10-05", "2026-02-30", "NaN-NaN-NaN") would orphan a task or
 * make the date bar throw on an Invalid Date, so it must never be stored or selected.
 */
export function isValidDateKey(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const year = Number(value.slice(0, 4))
  if (year < MIN_DATE_YEAR || year > MAX_DATE_YEAR) return false
  // Round-tripping rejects days that do not exist, which `new Date` would silently roll over.
  return toDateKey(parseDateKey(value)) === value
}

export function addDays(value: string, count: number): string {
  const date = parseDateKey(value)
  date.setDate(date.getDate() + count)
  return toDateKey(date)
}

export function isToday(value: string): boolean {
  return value === todayKey()
}
