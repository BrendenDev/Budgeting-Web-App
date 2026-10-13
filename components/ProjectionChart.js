'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { formatCurrency } from '@/lib/calculation-engine';

/**
 * Hand-built SVG line chart for the balance projection (replaces Recharts).
 * One 1.5px sage line, faint dotted rules, a "today" marker at the start,
 * and a hover crosshair with a label.
 *
 * @param {{ data: Array<{ date: string, balance: number }>, height?: number }} props
 */
export default function ProjectionChart({ data = [], height = 260 }) {
  const wrapRef = useRef(null);
  const [width, setWidth] = useState(0);
  const [hover, setHover] = useState(null);

  // Track container width so the SVG is drawn at real pixel size (crisp 1.5px line).
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => setWidth(Math.floor(entry.contentRect.width)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const pad = { top: 12, right: 12, bottom: 26, left: 48 };
  const innerW = Math.max(0, width - pad.left - pad.right);
  const innerH = height - pad.top - pad.bottom;

  const geom = useMemo(() => {
    if (data.length < 2 || innerW <= 0) return null;
    const values = data.map(d => d.balance);
    let min = Math.min(...values);
    let max = Math.max(...values);
    if (min === max) { min -= 1; max += 1; }

    // "Nice" tick step (1, 2, 2.5, 5 × 10^n) for ~4 rules
    const rough = (max - min) / 4;
    const mag = Math.pow(10, Math.floor(Math.log10(rough)));
    const step = [1, 2, 2.5, 5, 10].map(m => m * mag).find(s => s >= rough) || rough;
    const lo = Math.floor(min / step) * step;
    const hi = Math.ceil(max / step) * step;
    const ticks = [];
    for (let v = lo; v <= hi + step / 2; v += step) ticks.push(v);

    const x = (i) => pad.left + (i / (data.length - 1)) * innerW;
    const y = (v) => pad.top + innerH - ((v - lo) / (hi - lo)) * innerH;

    const path = data.map((d, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(d.balance).toFixed(1)}`).join('');

    // ~5 evenly spaced x labels
    const labelCount = Math.min(5, data.length);
    const xLabels = Array.from({ length: labelCount }, (_, k) =>
      Math.round((k / (labelCount - 1)) * (data.length - 1))
    );

    const useDecimals = hi - lo < 4000;
    const fmtTick = (v) => `$${(v / 1000).toFixed(useDecimals ? 1 : 0)}k`;

    return { ticks, x, y, path, xLabels, fmtTick, lo };
  }, [data, innerW, innerH, pad.left, pad.top]);

  const handleMove = (e) => {
    if (!geom) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const px = e.clientX - rect.left - pad.left;
    const i = Math.round((px / innerW) * (data.length - 1));
    setHover(Math.max(0, Math.min(data.length - 1, i)));
  };

  const h = hover != null && geom ? { i: hover, d: data[hover], cx: geom.x(hover), cy: geom.y(data[hover].balance) } : null;

  return (
    <div ref={wrapRef} className="relative w-full" style={{ height }}>
      {geom && (
        <svg
          width={width}
          height={height}
          className="block select-none"
          onMouseMove={handleMove}
          onMouseLeave={() => setHover(null)}
          role="img"
          aria-label="Projected balance over time"
        >
          {/* Horizontal dotted rules + y labels */}
          {geom.ticks.map(t => (
            <g key={t}>
              <line
                x1={pad.left} x2={pad.left + innerW} y1={geom.y(t)} y2={geom.y(t)}
                className="stroke-rule" strokeDasharray="1 4" strokeLinecap="round"
              />
              <text x={pad.left - 8} y={geom.y(t)} dy="0.32em" textAnchor="end" className="fill-faint num text-[10px]">
                {geom.fmtTick(t)}
              </text>
            </g>
          ))}

          {/* Baseline */}
          <line
            x1={pad.left} x2={pad.left + innerW} y1={pad.top + innerH} y2={pad.top + innerH}
            className="stroke-rule"
          />

          {/* X labels */}
          {geom.xLabels.map((i, k) => (
            <text
              key={i}
              x={geom.x(i)}
              y={height - 8}
              textAnchor={k === 0 ? 'start' : k === geom.xLabels.length - 1 ? 'end' : 'middle'}
              className="fill-faint text-[10px]"
            >
              {data[i].date}
            </text>
          ))}

          {/* Today marker */}
          <line
            x1={geom.x(0)} x2={geom.x(0)} y1={pad.top} y2={pad.top + innerH}
            className="stroke-rule-strong"
          />
          <text x={geom.x(0) + 4} y={pad.top + 8} className="fill-muted text-[10px]">today</text>

          {/* The line */}
          <path d={geom.path} fill="none" className="stroke-accent" strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" />

          {/* Hover crosshair */}
          {h && (
            <g pointerEvents="none">
              <line x1={h.cx} x2={h.cx} y1={pad.top} y2={pad.top + innerH} className="stroke-muted" strokeDasharray="2 3" />
              <circle cx={h.cx} cy={h.cy} r="3" className="fill-bg stroke-accent" strokeWidth="1.5" />
            </g>
          )}
        </svg>
      )}

      {/* Hover label */}
      {h && (
        <div
          className="pointer-events-none absolute top-0 rounded-sm border border-rule bg-surface px-2 py-1 text-xs whitespace-nowrap"
          style={{
            left: Math.min(Math.max(h.cx - 60, pad.left), Math.max(pad.left, width - 130)),
          }}
        >
          <span className="text-muted">{h.d.date}</span>{' '}
          <span className="num text-ink">{formatCurrency(h.d.balance)}</span>
        </div>
      )}
    </div>
  );
}
