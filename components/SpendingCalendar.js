'use client';

import { useMemo } from 'react';
import { getTodayMT } from '@/lib/date-utils';

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

  // 4 shading steps: quantise intensity so the grid reads as calm bands, not a gradient.
  const step = (i) => (i <= 0 ? 0 : i <= 0.25 ? 0.25 : i <= 0.5 ? 0.5 : i <= 0.75 ? 0.75 : 1);

  const navBtn =
    'cursor-pointer px-2 py-1 text-sm text-muted transition-colors hover:text-ink disabled:cursor-default disabled:opacity-30 disabled:hover:text-muted';

  return (
    <div>
      {/* Month navigation */}
      <div className="mb-3 flex items-center justify-between">
        <button className={navBtn} onClick={goPrev} title="Previous month" aria-label="Previous month">←</button>
        <button
          className="cursor-pointer text-sm text-ink transition-colors hover:text-accent"
          onClick={goToday}
          title="Go to current month"
        >
          {monthLabel}
        </button>
        <button
          className={navBtn}
          onClick={goNext}
          disabled={!canGoNext}
          title={canGoNext ? 'Next month' : 'Current month'}
          aria-label="Next month"
        >→</button>
      </div>

      {/* Day-of-week headers */}
      <div className="grid grid-cols-7 gap-px">
        {DAY_LABELS.map(d => (
          <div key={d} className="pb-1.5 text-center text-[11px] text-faint">{d}</div>
        ))}

        {/* Calendar cells */}
        {cells.map(cell => {
          if (cell.type === 'empty') {
            return <div key={cell.key} />;
          }
          const { day, spent, isFuture, isToday, isSelected, intensity } = cell;
          const hasSpend = !isFuture && spent > 0;
          return (
            <div
              key={day}
              className={[
                'cal-shade relative flex min-h-9 flex-col items-center justify-center rounded-sm border md:min-h-12',
                isFuture ? 'cursor-default text-faint/50' : 'cursor-pointer hover:border-rule-strong',
                isSelected ? 'border-accent' : isToday ? 'border-muted' : 'border-transparent',
              ].join(' ')}
              onClick={() => !isFuture && onDayClick?.(day)}
              style={hasSpend ? { '--spend-intensity': step(intensity) } : undefined}
            >
              <span className={`text-xs ${hasSpend ? 'text-ink' : isFuture ? '' : 'text-muted'}`}>{day}</span>
              {hasSpend && (
                <span className="num hidden text-[10px] text-ink/80 sm:block">
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
