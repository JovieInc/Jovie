'use client';

import { useEffect, useRef, useState } from 'react';
import { LINKS } from './mock-data';

/**
 * Link management demo showing social & music links with click counts.
 */
export function DashboardLinksDemo() {
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

  const maxClicks = Math.max(...LINKS.map(l => l.clicks));

  return (
    <div ref={containerRef}>
      <div
        className='overflow-hidden rounded-lg'
        style={{
          border: '1px solid var(--linear-border-subtle)',
          backgroundColor: 'var(--linear-bg-surface-0)',
        }}
      >
        {/* Header */}
        <div
          className='flex items-center justify-between px-4 py-3'
          style={{
            backgroundColor: 'var(--linear-bg-surface-1)',
            borderBottom: '1px solid var(--linear-border-subtle)',
          }}
        >
          <div className='flex items-center gap-4'>
            <span
              className='text-xs font-medium'
              style={{ color: 'var(--linear-text-primary)' }}
            >
              Music Links
            </span>
            <span
              className='text-xs'
              style={{ color: 'var(--linear-text-tertiary)' }}
            >
              Social Links
            </span>
          </div>
          <div
            className='rounded-md px-2.5 py-1 text-[11px] font-medium'
            style={{
              backgroundColor: 'var(--linear-btn-primary-bg)',
              color: 'var(--linear-btn-primary-fg)',
            }}
          >
            + Add link
          </div>
        </div>

        {/* Link rows */}
        <div>
          {LINKS.map((link, i) => (
            <div
              key={link.id}
              className='flex items-center gap-3 px-4 py-2.5'
              style={{
                borderBottom:
                  i < LINKS.length - 1
                    ? '1px solid var(--linear-border-subtle)'
                    : undefined,
                opacity: visible ? 1 : 0,
                transform: visible ? 'translateX(0)' : 'translateX(-12px)',
                transition: `opacity 0.4s ease ${i * 50}ms, transform 0.4s ease ${i * 50}ms`,
              }}
            >
              {/* Drag handle */}
              <div
                className='flex flex-col gap-[2px] opacity-30'
                style={{ color: 'var(--linear-text-tertiary)' }}
              >
                <span className='text-[8px] leading-none'>⋮⋮</span>
              </div>

              {/* Platform icon & name */}
              <div className='flex min-w-0 flex-1 items-center gap-2.5'>
                <span className='text-sm'>{link.icon}</span>
                <div className='min-w-0'>
                  <p
                    className='text-xs font-medium'
                    style={{ color: 'var(--linear-text-primary)' }}
                  >
                    {link.platform}
                  </p>
                  <p
                    className='truncate text-[10px]'
                    style={{ color: 'var(--linear-text-tertiary)' }}
                  >
                    {link.url}
                  </p>
                </div>
              </div>

              {/* Click sparkline */}
              <div className='hidden items-center gap-2 sm:flex'>
                <div
                  className='h-3 w-16 overflow-hidden rounded-full'
                  style={{ backgroundColor: 'var(--linear-bg-surface-2)' }}
                >
                  <div
                    className='h-full rounded-full'
                    style={{
                      width: visible
                        ? `${(link.clicks / maxClicks) * 100}%`
                        : '0%',
                      backgroundColor: 'var(--linear-accent)',
                      opacity: 0.7,
                      transition: `width 0.8s cubic-bezier(0.34,1.56,0.64,1) ${i * 60}ms`,
                    }}
                  />
                </div>
                <span
                  className='w-10 text-right text-[11px] tabular-nums'
                  style={{ color: 'var(--linear-text-tertiary)' }}
                >
                  {link.clicks.toLocaleString()}
                </span>
              </div>

              {/* Toggle */}
              <div
                className='h-4 w-7 shrink-0 rounded-full'
                style={{
                  backgroundColor: link.active
                    ? 'var(--linear-success)'
                    : 'var(--linear-bg-surface-2)',
                  position: 'relative',
                  transition: 'background-color 0.2s',
                }}
              >
                <div
                  className='absolute top-0.5 h-3 w-3 rounded-full'
                  style={{
                    left: link.active ? 14 : 2,
                    backgroundColor: '#fff',
                    transition: 'left 0.2s',
                    boxShadow: '0 1px 2px rgba(0,0,0,0.2)',
                  }}
                />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
