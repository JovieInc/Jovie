'use client';

import { useEffect, useRef, useState } from 'react';
import { AUDIENCE_MEMBERS, AUDIENCE_SUMMARY } from './mock-data';

const INTENT_COLORS: Record<string, string> = {
  High: '#22c55e',
  Medium: '#f59e0b',
  Low: '#94a3b8',
};

/**
 * Audience management demo with subscriber summary and a table of fan activity.
 */
export function DashboardAudienceDemo() {
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

  return (
    <div ref={containerRef} className='space-y-4'>
      {/* Summary row */}
      <div className='grid grid-cols-2 gap-3 sm:grid-cols-4'>
        {[
          {
            label: 'Total Subscribers',
            value: AUDIENCE_SUMMARY.totalSubscribers.toLocaleString(),
          },
          {
            label: 'Email',
            value: AUDIENCE_SUMMARY.emailSubscribers.toLocaleString(),
          },
          {
            label: 'SMS',
            value: AUDIENCE_SUMMARY.smsSubscribers.toLocaleString(),
          },
          { label: 'Growth', value: `+${AUDIENCE_SUMMARY.subscriberGrowth}%` },
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

      {/* Audience table */}
      <div
        className='overflow-hidden rounded-lg'
        style={{
          border: '1px solid var(--linear-border-subtle)',
          backgroundColor: 'var(--linear-bg-surface-0)',
        }}
      >
        <table className='w-full text-left text-xs'>
          <thead>
            <tr style={{ backgroundColor: 'var(--linear-bg-surface-1)' }}>
              {['Visitor', 'Intent', 'Status', 'Source', 'Last Action'].map(
                h => (
                  <th
                    key={h}
                    className='px-3 py-2 font-medium'
                    style={{
                      color: 'var(--linear-text-tertiary)',
                      borderBottom: '1px solid var(--linear-border-subtle)',
                    }}
                  >
                    {h}
                  </th>
                )
              )}
            </tr>
          </thead>
          <tbody>
            {AUDIENCE_MEMBERS.map((m, i) => (
              <tr
                key={m.id}
                style={{
                  opacity: visible ? 1 : 0,
                  transform: visible ? 'translateY(0)' : 'translateY(8px)',
                  transition: `opacity 0.4s ease ${i * 60}ms, transform 0.4s ease ${i * 60}ms`,
                  borderBottom:
                    i < AUDIENCE_MEMBERS.length - 1
                      ? '1px solid var(--linear-border-subtle)'
                      : undefined,
                }}
              >
                <td
                  className='px-3 py-2'
                  style={{ color: 'var(--linear-text-primary)' }}
                >
                  {m.name}
                </td>
                <td className='px-3 py-2'>
                  <span
                    className='inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium'
                    style={{
                      backgroundColor: `${INTENT_COLORS[m.intent]}20`,
                      color: INTENT_COLORS[m.intent],
                    }}
                  >
                    <span
                      className='h-1.5 w-1.5 rounded-full'
                      style={{ backgroundColor: INTENT_COLORS[m.intent] }}
                    />
                    {m.intent}
                  </span>
                </td>
                <td
                  className='px-3 py-2'
                  style={{ color: 'var(--linear-text-secondary)' }}
                >
                  {m.status}
                </td>
                <td
                  className='px-3 py-2'
                  style={{ color: 'var(--linear-text-secondary)' }}
                >
                  {m.source}
                </td>
                <td
                  className='px-3 py-2'
                  style={{ color: 'var(--linear-text-tertiary)' }}
                >
                  {m.lastAction}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
