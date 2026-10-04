import { useEffect, useMemo, useRef, useState } from 'react'

import { IconCalendar, IconNextDay, IconPreviousDay } from '../common/icons'

import { useI18n } from '../../hooks/use-i18n'
import { tasksOnDate } from '../../store/data-helpers'
import { useAppStore } from '../../store/use-app-store'
import {
  addDays,
  isToday,
  isValidDateKey,
  parseDateKey,
  toDateKey,
  todayKey,
} from '../../utils/date'

const localeMap = {
  zh: 'zh-CN',
  en: 'en-US',
  ja: 'ja-JP',
} as const

type TransitionDirection = 'forward' | 'backward'

function toMonthStart(value: string): Date {
  const date = parseDateKey(value)
  return new Date(date.getFullYear(), date.getMonth(), 1)
}

function shiftMonth(value: Date, amount: number): Date {
  return new Date(value.getFullYear(), value.getMonth() + amount, 1)
}

export default function DateBar(): JSX.Element {
  const { formatDate, formatWeekday, lang, weekdays, t } = useI18n()
  const data = useAppStore((state) => state.data)
  const storedDate = useAppStore((state) => state.selectedDate)
  const setSelectedDate = useAppStore((state) => state.setSelectedDate)
  const calendarRef = useRef<HTMLDivElement | null>(null)
  const toggleRef = useRef<HTMLButtonElement | null>(null)
  const [calendarOpen, setCalendarOpen] = useState(false)
  const [transitionDirection, setTransitionDirection] =
    useState<TransitionDirection>('forward')
  // A key that is not a real day would make every date formatter below throw an Invalid Date
  // RangeError and take the whole Tasks tab down, so show today instead.
  const today = todayKey()
  const selectedDate = isValidDateKey(storedDate) ? storedDate : today
  const [visibleMonth, setVisibleMonth] = useState(() =>
    toMonthStart(selectedDate)
  )

  const days = Array.from({ length: 7 }, (_, index) =>
    addDays(selectedDate, index - 3)
  )
  const selected = parseDateKey(selectedDate)
  const locale = localeMap[lang] ?? 'en-US'
  const monthFormatter = useMemo(
    () =>
      new Intl.DateTimeFormat(locale, {
        year: 'numeric',
        month: 'long',
      }),
    [locale]
  )
  const shortMonthFormatter = useMemo(
    () =>
      new Intl.DateTimeFormat(locale, {
        month: 'short',
      }),
    [locale]
  )

  useEffect(() => {
    if (!calendarOpen) {
      return
    }

    const handlePointerDown = (event: MouseEvent) => {
      if (
        calendarRef.current &&
        event.target instanceof Node &&
        !calendarRef.current.contains(event.target)
      ) {
        setCalendarOpen(false)
      }
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') {
        return
      }

      const { commandOpen, modal } = useAppStore.getState()
      if (modal || commandOpen) {
        // A dialog is on top and handles this Escape itself; the calendar behind it just closes.
        setCalendarOpen(false)
        return
      }

      // Escape closes one layer at a time: swallow it here so the window-level shortcut does not
      // also collapse the whole panel.
      event.preventDefault()
      event.stopPropagation()
      setCalendarOpen(false)
      toggleRef.current?.focus()
    }

    document.addEventListener('mousedown', handlePointerDown)
    document.addEventListener('keydown', handleKeyDown)

    return () => {
      document.removeEventListener('mousedown', handlePointerDown)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [calendarOpen])

  const selectedCount = data ? tasksOnDate(data, selectedDate).length : 0
  const calendarDays = useMemo(() => {
    if (!data) {
      return []
    }

    const monthStart = new Date(
      visibleMonth.getFullYear(),
      visibleMonth.getMonth(),
      1
    )
    const gridStart = new Date(monthStart)
    gridStart.setDate(monthStart.getDate() - monthStart.getDay())

    return Array.from({ length: 42 }, (_, index) => {
      const date = new Date(gridStart)
      date.setDate(gridStart.getDate() + index)

      const key = toDateKey(date)

      return {
        key,
        date,
        count: tasksOnDate(data, key).length,
        inMonth: date.getMonth() === visibleMonth.getMonth(),
      }
    })
  }, [data, visibleMonth])

  if (!data) {
    return <div className="task-datebar" />
  }

  const selectDate = (nextDate: string) => {
    if (nextDate === selectedDate) {
      setCalendarOpen(false)
      return
    }

    setVisibleMonth(toMonthStart(nextDate))
    setTransitionDirection(nextDate > selectedDate ? 'forward' : 'backward')
    setSelectedDate(nextDate)
    setCalendarOpen(false)
  }

  const changeDateBy = (offset: number) => {
    const nextDate = addDays(selectedDate, offset)
    setVisibleMonth(toMonthStart(nextDate))
    setTransitionDirection(offset >= 0 ? 'forward' : 'backward')
    setSelectedDate(nextDate)
  }

  return (
    <>
      <div className="task-datebar-shell" ref={calendarRef}>
        <div className="task-datebar">
          <button
            className="date-nav"
            type="button"
            onClick={() => changeDateBy(-1)}
          >
            <IconPreviousDay size={18} />
          </button>
          <button
            ref={toggleRef}
            className={`date-display ${calendarOpen ? 'active' : ''}`}
            type="button"
            data-testid="date-display-toggle"
            aria-haspopup="dialog"
            aria-expanded={calendarOpen}
            onClick={() => {
              setVisibleMonth(toMonthStart(selectedDate))
              setCalendarOpen((open) => !open)
            }}
          >
            <div
              key={`${selectedDate}-${transitionDirection}`}
              className={`date-display-copy ${transitionDirection}`}
            >
              <strong className="date-main">
                {formatDate(selected)}
                {isToday(selectedDate) ? (
                  <em className="date-today-tag">{t('today')}</em>
                ) : null}
              </strong>
              <span className="date-sub">
                {formatWeekday(selected)} / {selectedCount} {t('tasks_count')}
              </span>
            </div>
            <span className="date-display-icon" aria-hidden="true">
              <IconCalendar size={16} />
            </span>
          </button>
          {!isToday(selectedDate) && (
            <button
              className="today-btn"
              type="button"
              onClick={() => selectDate(today)}
            >
              {t('today')}
            </button>
          )}
          <button
            className="date-nav"
            type="button"
            onClick={() => changeDateBy(1)}
          >
            <IconNextDay size={18} />
          </button>
        </div>
        {calendarOpen ? (
          <div className="calendar-popover" data-testid="date-calendar">
            <div className="calendar-header">
              <button
                className="icon-button calendar-nav"
                type="button"
                onClick={() =>
                  setVisibleMonth((current) => shiftMonth(current, -1))
                }
              >
                <IconPreviousDay size={16} />
              </button>
              <div className="calendar-title">
                <strong>{monthFormatter.format(visibleMonth)}</strong>
                <span>
                  {formatDate(selected)} / {selectedCount} {t('tasks_count')}
                </span>
              </div>
              <button
                className="icon-button calendar-nav"
                type="button"
                onClick={() =>
                  setVisibleMonth((current) => shiftMonth(current, 1))
                }
              >
                <IconNextDay size={16} />
              </button>
            </div>
            <div className="calendar-weekdays">
              {weekdays.map((weekday, index) => (
                <span key={`${weekday}-${index}`} className="calendar-weekday">
                  {weekday}
                </span>
              ))}
            </div>
            <div className="calendar-grid">
              {calendarDays.map((day) => (
                <button
                  key={day.key}
                  className={`calendar-day ${selectedDate === day.key ? 'active' : ''} ${isToday(day.key) ? 'today' : ''} ${day.inMonth ? '' : 'outside-month'}`}
                  type="button"
                  data-testid={`calendar-day-${day.key}`}
                  onClick={() => selectDate(day.key)}
                >
                  <span className="calendar-day-number">
                    {day.date.getDate()}
                  </span>
                  <span className="calendar-day-meta">
                    {shortMonthFormatter.format(day.date)}
                  </span>
                  <span className="calendar-day-dots">
                    {Array.from(
                      { length: Math.min(day.count, 3) },
                      (_, index) => (
                        <span key={`${day.key}-${index}`} className="wd-pip" />
                      )
                    )}
                  </span>
                </button>
              ))}
            </div>
            <div className="calendar-footer">
              <button
                className="text-button calendar-today-link"
                type="button"
                onClick={() => selectDate(today)}
              >
                {t('today')}
              </button>
              <span className="calendar-selection">
                {formatWeekday(selected)}
              </span>
            </div>
          </div>
        ) : null}
      </div>
      <div className="week-strip-shell">
        <div
          key={`${selectedDate}-${transitionDirection}`}
          className={`week-strip-track ${transitionDirection}`}
        >
          {days.map((day) => {
            const date = parseDateKey(day)
            const count = tasksOnDate(data, day).length
            return (
              <button
                key={day}
                className={`week-day ${selectedDate === day ? 'active' : ''} ${isToday(day) ? 'today' : ''}`}
                type="button"
                data-testid={`date-pill-${day}`}
                onClick={() => selectDate(day)}
              >
                <div className="wd-label">{weekdays[date.getDay()]}</div>
                <div className="wd-num">{date.getDate()}</div>
                <div className="wd-meta">
                  {shortMonthFormatter.format(date)}
                </div>
                <div className="wd-dot">
                  {Array.from({ length: Math.min(count, 3) }, (_, index) => (
                    <span key={`${day}-${index}`} className="wd-pip" />
                  ))}
                </div>
              </button>
            )
          })}
        </div>
      </div>
    </>
  )
}
