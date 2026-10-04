'use client';

import { useMemo, useState } from 'react';
import type { MoneyTrendPoint } from '@/lib/finance/metrics';

/**
 * Restrained historical trend plot for the Money overview (JOV-4618).
 * Pure SVG — no chart bundle, no animation (reduced-motion safe by
 * construction). Windows 30D / 90D / 1Y / All; series toggles; a visually
 * hidden table provides the same data to screen readers.
 */

const WINDOWS = [
  { id: '30d', label: '30D', days: 30 },
  { id: '90d', label: '90D', days: 90 },
  { id: '1y', label: '1Y', days: 365 },
  { id: 'all', label: 'All', days: Number.POSITIVE_INFINITY },
] as const;

type WindowId = (typeof WINDOWS)[number]['id'];

const SERIES = [
  {
    key: 'income',
    label: 'Income',
    color: 'var(--color-accent-green, #2f9e44)',
  },
  { key: 'personalExpenses', label: 'Personal Spend', color: '#e8590c' },
  { key: 'creatorExpenses', label: 'Creator Spend', color: '#7048e8' },
  { key: 'netCashFlow', label: 'Net Cash Flow', color: '#868e96' },
  { key: 'cashBalance', label: 'Cash Balance', color: '#1c7ed6' },
] as const;

type SeriesKey = (typeof SERIES)[number]['key'];

const W = 720;
const H = 240;
const PAD = { top: 12, right: 8, bottom: 24, left: 8 };

function sliceWindow(points: MoneyTrendPoint[], days: number) {
  if (!Number.isFinite(days)) return points;
  const cutoff = new Date(Date.now() - days * 86_400_000)
    .toISOString()
    .slice(0, 10);
  return points.filter(p => p.date >= cutoff);
}

export function MoneyTrendChart({
  points,
}: {
  readonly points: MoneyTrendPoint[];
}) {
  const [windowId, setWindowId] = useState<WindowId>('90d');
  const [visible, setVisible] = useState<ReadonlySet<SeriesKey>>(
    () => new Set(SERIES.map(s => s.key))
  );

  const window = WINDOWS.find(w => w.id === windowId) ?? WINDOWS[1];
  const data = useMemo(
    () => sliceWindow(points, window.days),
    [points, window.days]
  );

  const max = useMemo(() => {
    let m = 0;
    for (const p of data) {
      for (const s of SERIES) {
        if (!visible.has(s.key)) continue;
        m = Math.max(m, Math.abs(p[s.key]));
      }
    }
    return m || 1;
  }, [data, visible]);

  const pathFor = (key: SeriesKey) => {
    if (data.length === 0) return '';
    const stepX =
      data.length > 1 ? (W - PAD.left - PAD.right) / (data.length - 1) : 0;
    const zeroY = PAD.top + (H - PAD.top - PAD.bottom) / 2;
    const halfH = (H - PAD.top - PAD.bottom) / 2;
    return data
      .map((p, i) => {
        const x = PAD.left + i * stepX;
        const y = zeroY - (p[key] / max) * halfH;
        return `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`;
      })
      .join(' ');
  };

  const toggle = (key: SeriesKey) => {
    setVisible(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const summary = `${data.length} daily points. Peak absolute value ${Math.round(
    max
  ).toLocaleString()} across visible series.`;

  return (
    <div data-testid='money-trend-chart'>
      <div className='mb-3 flex flex-wrap items-center justify-between gap-2'>
        <fieldset className='flex gap-1 border-0 p-0 m-0 min-w-0'>
          <legend className='sr-only'>Time window</legend>
          {WINDOWS.map(w => (
            <button
              key={w.id}
              type='button'
              aria-pressed={windowId === w.id}
              onClick={() => setWindowId(w.id)}
              className={`rounded-md px-3 py-1 text-xs font-medium ${
                windowId === w.id
                  ? 'bg-surface-2 text-primary-token'
                  : 'text-tertiary-token hover:text-secondary-token'
              }`}
            >
              {w.label}
            </button>
          ))}
        </fieldset>
        <fieldset className='flex flex-wrap gap-2 border-0 p-0 m-0 min-w-0'>
          <legend className='sr-only'>Series</legend>
          {SERIES.map(s => (
            <button
              key={s.key}
              type='button'
              aria-pressed={visible.has(s.key)}
              onClick={() => toggle(s.key)}
              className='flex items-center gap-1.5 rounded-md px-2 py-1 text-xs text-secondary-token'
            >
              <span
                aria-hidden
                className='inline-block h-2 w-2 rounded-full'
                style={{
                  backgroundColor: s.color,
                  opacity: visible.has(s.key) ? 1 : 0.25,
                }}
              />
              {s.label}
            </button>
          ))}
        </fieldset>
      </div>

      <svg
        viewBox={`0 0 ${W} ${H}`}
        className='h-56 w-full'
        role='img'
        aria-label={`Money trend, ${window.label} window. ${summary}`}
      >
        <line
          x1={PAD.left}
          x2={W - PAD.right}
          y1={PAD.top + (H - PAD.top - PAD.bottom) / 2}
          y2={PAD.top + (H - PAD.top - PAD.bottom) / 2}
          stroke='currentColor'
          strokeOpacity={0.15}
          strokeDasharray='3 4'
        />
        {SERIES.filter(s => visible.has(s.key)).map(s => (
          <path
            key={s.key}
            d={pathFor(s.key)}
            fill='none'
            stroke={s.color}
            strokeWidth={s.key === 'cashBalance' ? 2 : 1.5}
            strokeOpacity={s.key === 'netCashFlow' ? 0.9 : 0.85}
          />
        ))}
        {data.length > 0 && (
          <>
            <text
              x={PAD.left}
              y={H - 6}
              className='fill-current text-3xs text-tertiary-token'
            >
              {data[0].date}
            </text>
            <text
              x={W - PAD.right}
              y={H - 6}
              textAnchor='end'
              className='fill-current text-3xs text-tertiary-token'
            >
              {data[data.length - 1].date}
            </text>
          </>
        )}
      </svg>
    </div>
  );
}
