'use client';

import { useMemo } from 'react';
import { getCurrentMonthMT, getCurrentYearMT, getTodayMT } from '@/lib/date-utils';

const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/**
 * Spending heatmap calendar with month navigation.
 *
 * @param {{ dailySpending: Record<number, number>, selectedDay: number|null, onDayClick: (day: number) => void, month: number, year: number, onMonthChange: (month: number, year: number) => void }} props
 */
export default function SpendingCalendar({ dailySpending = {}, selectedDay, onDayClick, month, year, onMonthChange }) {
  const todayStr = getTodayMT();
  const [todayY, todayM, todayD] = todayStr.split('-').map(Number);
  const isCurrentMonth = month === (todayM - 1) && year === todayY;
  const isFutureMonth = year > todayY || (year === todayY && month > todayM - 1);

  const { daysInMonth, startDow, maxSpend, monthLabel } = useMemo(() => {
    const dim = new Date(year, month + 1, 0).getDate();
    const dow = new Date(year, month, 1).getDay(); // 0=Sun
    const max = Math.max(0, ...Object.values(dailySpending));
    const label = new Date(year, month).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
    return { daysInMonth: dim, startDow: dow, maxSpend: max, monthLabel: label };
  }, [month, year, dailySpending]);

  const goPrev = () => {
    const pm = month === 0 ? 11 : month - 1;
    const py = month === 0 ? year - 1 : year;
    onMonthChange?.(pm, py);
  };

  const goNext = () => {
    if (isFutureMonth) return; // Don't go past current month
    const nm = month === 11 ? 0 : month + 1;
    const ny = month === 11 ? year + 1 : year;
    onMonthChange?.(nm, ny);
  };

  const goToday = () => {
    onMonthChange?.(todayM - 1, todayY);
  };

  // Build calendar grid cells
  const cells = [];
  for (let i = 0; i < startDow; i++) {
    cells.push({ type: 'empty', key: `e${i}` });
  }
  for (let d = 1; d <= daysInMonth; d++) {
    const spent = dailySpending[d] || 0;
    const isFuture = isCurrentMonth ? d > todayD : isFutureMonth;
    const isToday = isCurrentMonth && d === todayD;
    const isSelected = d === selectedDay;
    const intensity = maxSpend > 0 ? spent / maxSpend : 0;
    cells.push({ type: 'day', key: d, day: d, spent, isFuture, isToday, isSelected, intensity });
  }

  const canGoNext = !isFutureMonth && !(isCurrentMonth);

  return (
    <div className="spend-calendar">
      {/* Month navigation */}
      <div className="spend-calendar-nav">
        <button className="spend-calendar-nav-btn" onClick={goPrev} title="Previous month">←</button>
        <button className="spend-calendar-month-btn" onClick={goToday} title="Go to current month">
          {monthLabel}
        </button>
        <button
          className="spend-calendar-nav-btn"
          onClick={goNext}
          disabled={!canGoNext}
          title={canGoNext ? 'Next month' : 'Current month'}
        >→</button>
      </div>

      {/* Day-of-week headers */}
      <div className="spend-calendar-grid">
        {DAY_LABELS.map(d => (
          <div key={d} className="spend-calendar-dow">{d}</div>
        ))}

        {/* Calendar cells */}
        {cells.map(cell => {
          if (cell.type === 'empty') {
            return <div key={cell.key} className="spend-calendar-cell spend-calendar-cell-empty" />;
          }
          const { day, spent, isFuture, isToday, isSelected, intensity } = cell;
          return (
            <div
              key={day}
              className={[
                'spend-calendar-cell',
                isFuture ? 'cell-future' : '',
                isToday ? 'cell-today' : '',
                isSelected ? 'cell-selected' : '',
                !isFuture && spent > 0 ? 'cell-has-spend' : '',
              ].filter(Boolean).join(' ')}
              onClick={() => !isFuture && onDayClick?.(day)}
              style={!isFuture && spent > 0 ? {
                '--spend-intensity': intensity,
              } : undefined}
            >
              <span className="spend-calendar-day-num">{day}</span>
              {!isFuture && spent > 0 && (
                <span className="spend-calendar-amount">
                  ${spent >= 1000 ? `${(spent / 1000).toFixed(1)}k` : spent.toFixed(0)}
                </span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
