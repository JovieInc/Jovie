'use client';

import { useEffect, useRef, useState } from 'react';
import { ANALYTICS_SUMMARY, DAILY_CLICKS, PLATFORM_CLICKS } from './mock-data';

/**
 * Analytics dashboard demo with a 30-day click chart,
 * summary stat cards, and a platform breakdown bar chart.
 */
export function DashboardAnalyticsDemo() {
  const containerRef = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);

  // Trigger entrance animation when scrolled into view
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

  const maxClicks = Math.max(...DAILY_CLICKS.map(d => d.clicks));
  const maxPlatformClicks = Math.max(...PLATFORM_CLICKS.map(p => p.clicks));

  return (
    <div ref={containerRef} className='space-y-5'>
      {/* Summary cards */}
      <div className='grid grid-cols-2 gap-3 sm:grid-cols-4'>
        {[
          {
            label: 'Total Clicks',
            value: ANALYTICS_SUMMARY.totalClicks.toLocaleString(),
          },
          {
            label: 'Unique Visitors',
            value: ANALYTICS_SUMMARY.uniqueVisitors.toLocaleString(),
          },
          { label: 'Top Platform', value: ANALYTICS_SUMMARY.topPlatform },
          { label: 'Growth', value: `+${ANALYTICS_SUMMARY.clickGrowth}%` },
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

      {/* Area chart (CSS-only) */}
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
          Clicks — Last 30 days
        </p>
        <div className='flex items-end gap-[3px]' style={{ height: 100 }}>
          {DAILY_CLICKS.map((d, i) => {
            const heightPct = (d.clicks / maxClicks) * 100;
            return (
              <div
                key={d.date}
                className='flex-1 rounded-t-sm'
                style={{
                  height: visible ? `${heightPct}%` : '0%',
                  backgroundColor: 'var(--linear-accent)',
                  opacity: 0.7 + (i / DAILY_CLICKS.length) * 0.3,
                  transition: `height 0.6s cubic-bezier(0.34,1.56,0.64,1) ${i * 20}ms`,
                }}
              />
            );
          })}
        </div>
        <div
          className='mt-2 flex justify-between text-[10px]'
          style={{ color: 'var(--linear-text-tertiary)' }}
        >
          <span>{DAILY_CLICKS[0].date}</span>
          <span>{DAILY_CLICKS[DAILY_CLICKS.length - 1].date}</span>
        </div>
      </div>

      {/* Platform breakdown */}
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
          Clicks by platform
        </p>
        <div className='space-y-2'>
          {PLATFORM_CLICKS.map((p, i) => {
            const widthPct = (p.clicks / maxPlatformClicks) * 100;
            return (
              <div key={p.platform} className='flex items-center gap-3'>
                <span
                  className='w-20 shrink-0 text-xs'
                  style={{ color: 'var(--linear-text-secondary)' }}
                >
                  {p.platform}
                </span>
                <div
                  className='relative h-4 flex-1 overflow-hidden rounded-full'
                  style={{ backgroundColor: 'var(--linear-bg-surface-2)' }}
                >
                  <div
                    className='h-full rounded-full'
                    style={{
                      width: visible ? `${widthPct}%` : '0%',
                      backgroundColor: p.color,
                      transition: `width 0.8s cubic-bezier(0.34,1.56,0.64,1) ${i * 80}ms`,
                    }}
                  />
                </div>
                <span
                  className='w-12 shrink-0 text-right text-xs tabular-nums'
                  style={{ color: 'var(--linear-text-tertiary)' }}
                >
                  {p.clicks.toLocaleString()}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
