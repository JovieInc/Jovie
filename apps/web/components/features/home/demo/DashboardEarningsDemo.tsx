'use client';

import { useEffect, useRef, useState } from 'react';
import { formatAmount } from '@/lib/utils/format-number';
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

  return (
    <div ref={containerRef} className='space-y-4'>
      {/* Summary cards */}
      <div className='grid grid-cols-2 gap-3 sm:grid-cols-4'>
        {[
          {
            label: 'Total Earned',
            value: formatAmount(EARNINGS_SUMMARY.totalReceivedCents),
          },
          {
            label: 'This Month',
            value: formatAmount(EARNINGS_SUMMARY.monthReceivedCents),
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
            className='rounded-lg px-3 py-2.5 bg-surface-1 border border-subtle'
          >
            <p className='text-[11px] text-tertiary-token'>{card.label}</p>
            <p className='mt-0.5 text-lg font-semibold tabular-nums text-primary-token'>
              {card.value}
            </p>
          </div>
        ))}
      </div>

      <div className='grid gap-4 sm:grid-cols-2'>
        {/* Monthly chart */}
        <div className='rounded-lg px-4 py-3 bg-surface-1 border border-subtle'>
          <p className='mb-3 text-xs font-medium text-secondary-token'>
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
                      transition: `height 0.6s var(--ds-motion-cinematic-easing) ${i * 60}ms`,
                    }}
                  />
                  <span className='text-[10px] text-tertiary-token'>
                    {m.month}
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Recent tips */}
        <div className='rounded-lg px-4 py-3 bg-surface-1 border border-subtle'>
          <p className='mb-3 text-xs font-medium text-secondary-token'>
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
                  <p className='text-xs text-primary-token'>
                    {tip.donor}
                    {tip.message && (
                      <span className='text-tertiary-token'>
                        {' '}
                        — {tip.message}
                      </span>
                    )}
                  </p>
                  <p className='text-[10px] text-tertiary-token'>{tip.time}</p>
                </div>
                <span className='text-xs font-semibold tabular-nums text-success'>
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
