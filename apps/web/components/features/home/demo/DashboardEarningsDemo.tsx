'use client';

import { useEffect, useRef, useState } from 'react';
import { EARNINGS_SUMMARY, MONTHLY_EARNINGS, RECENT_TIPS } from './mock-data';

/**
 * Earnings/tips dashboard demo with monthly bar chart and recent tips.
 */
export function DashboardEarningsDemo() {
  const containerRef = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) setVisible(true);
      },
      { threshold: 0.2 }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const maxEarning = Math.max(...MONTHLY_EARNINGS.map(m => m.amount));

  const formatCents = (cents: number) => `$${(cents / 100).toFixed(2)}`;

  return (
    <div ref={containerRef} className='space-y-4'>
      {/* Summary cards */}
      <div className='grid grid-cols-2 gap-3 sm:grid-cols-4'>
        {[
          {
            label: 'Total Earned',
            value: formatCents(EARNINGS_SUMMARY.totalReceivedCents),
          },
          {
            label: 'This Month',
            value: formatCents(EARNINGS_SUMMARY.monthReceivedCents),
          },
          {
            label: 'Tips Received',
            value: EARNINGS_SUMMARY.tipsSubmitted.toString(),
          },
          {
            label: 'Tip Clicks',
            value: EARNINGS_SUMMARY.tipClicks.toLocaleString(),
          },
        ].map(card => (
          <div
            key={card.label}
            className='rounded-lg px-3 py-2.5'
            style={{
              backgroundColor: 'var(--linear-bg-surface-1)',
              border: '1px solid var(--linear-border-subtle)',
            }}
          >
            <p
              className='text-[11px]'
              style={{ color: 'var(--linear-text-tertiary)' }}
            >
              {card.label}
            </p>
            <p
              className='mt-0.5 text-lg font-semibold tabular-nums'
              style={{ color: 'var(--linear-text-primary)' }}
            >
              {card.value}
            </p>
          </div>
        ))}
      </div>

      <div className='grid gap-4 sm:grid-cols-2'>
        {/* Monthly chart */}
        <div
          className='rounded-lg px-4 py-3'
          style={{
            backgroundColor: 'var(--linear-bg-surface-1)',
            border: '1px solid var(--linear-border-subtle)',
          }}
        >
          <p
            className='mb-3 text-xs font-medium'
            style={{ color: 'var(--linear-text-secondary)' }}
          >
            Monthly earnings
          </p>
          <div className='flex items-end gap-2' style={{ height: 80 }}>
            {MONTHLY_EARNINGS.map((m, i) => {
              const heightPct = (m.amount / maxEarning) * 100;
              return (
                <div
                  key={m.month}
                  className='flex flex-1 flex-col items-center gap-1'
                >
                  <div
                    className='w-full rounded-t-sm'
                    style={{
                      height: visible ? `${heightPct}%` : '0%',
                      backgroundColor: 'var(--linear-success)',
                      opacity: 0.8,
                      transition: `height 0.6s cubic-bezier(0.34,1.56,0.64,1) ${i * 60}ms`,
                    }}
                  />
                  <span
                    className='text-[10px]'
                    style={{ color: 'var(--linear-text-tertiary)' }}
                  >
                    {m.month}
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Recent tips */}
        <div
          className='rounded-lg px-4 py-3'
          style={{
            backgroundColor: 'var(--linear-bg-surface-1)',
            border: '1px solid var(--linear-border-subtle)',
          }}
        >
          <p
            className='mb-3 text-xs font-medium'
            style={{ color: 'var(--linear-text-secondary)' }}
          >
            Recent tips
          </p>
          <ul className='space-y-2'>
            {RECENT_TIPS.map((tip, i) => (
              <li
                key={tip.id}
                className='flex items-center justify-between'
                style={{
                  opacity: visible ? 1 : 0,
                  transform: visible ? 'translateX(0)' : 'translateX(12px)',
                  transition: `opacity 0.4s ease ${i * 60}ms, transform 0.4s ease ${i * 60}ms`,
                }}
              >
                <div>
                  <p
                    className='text-xs'
                    style={{ color: 'var(--linear-text-primary)' }}
                  >
                    {tip.donor}
                    {tip.message && (
                      <span style={{ color: 'var(--linear-text-tertiary)' }}>
                        {' '}
                        — {tip.message}
                      </span>
                    )}
                  </p>
                  <p
                    className='text-[10px]'
                    style={{ color: 'var(--linear-text-tertiary)' }}
                  >
                    {tip.time}
                  </p>
                </div>
                <span
                  className='text-xs font-semibold tabular-nums'
                  style={{ color: 'var(--linear-success)' }}
                >
                  {tip.amount}
                </span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
