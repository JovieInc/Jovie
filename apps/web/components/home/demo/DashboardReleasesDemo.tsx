'use client';

import { useEffect, useRef, useState } from 'react';
import { RELEASES } from './mock-data';

/**
 * Releases management demo showing a discography table.
 */
export function DashboardReleasesDemo() {
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
          <p
            className='text-xs font-medium'
            style={{ color: 'var(--linear-text-secondary)' }}
          >
            {RELEASES.length} releases
          </p>
          <div
            className='rounded-md px-2.5 py-1 text-[11px] font-medium'
            style={{
              backgroundColor: 'var(--linear-btn-primary-bg)',
              color: 'var(--linear-btn-primary-fg)',
            }}
          >
            + Add release
          </div>
        </div>

        {/* Release rows */}
        <div>
          {RELEASES.map((release, i) => (
            <div
              key={release.id}
              className='flex items-center gap-3 px-4 py-3'
              style={{
                borderBottom:
                  i < RELEASES.length - 1
                    ? '1px solid var(--linear-border-subtle)'
                    : undefined,
                opacity: visible ? 1 : 0,
                transform: visible ? 'translateY(0)' : 'translateY(8px)',
                transition: `opacity 0.4s ease ${i * 60}ms, transform 0.4s ease ${i * 60}ms`,
              }}
            >
              {/* Artwork */}
              <div
                className='h-10 w-10 shrink-0 rounded-md'
                style={{ background: release.gradient }}
              />

              {/* Info */}
              <div className='min-w-0 flex-1'>
                <div className='flex items-center gap-2'>
                  <p
                    className='truncate text-sm font-medium'
                    style={{ color: 'var(--linear-text-primary)' }}
                  >
                    {release.title}
                  </p>
                  <span
                    className='shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-medium'
                    style={{
                      backgroundColor: 'var(--linear-bg-surface-2)',
                      color: 'var(--linear-text-secondary)',
                    }}
                  >
                    {release.type}
                  </span>
                  {release.hasSmartLink && (
                    <span
                      className='shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-medium'
                      style={{
                        backgroundColor: 'var(--linear-accent)',
                        color: '#fff',
                        opacity: 0.9,
                      }}
                    >
                      Smart Link
                    </span>
                  )}
                </div>
                <p
                  className='mt-0.5 text-[11px]'
                  style={{ color: 'var(--linear-text-tertiary)' }}
                >
                  {release.date} · {release.trackCount}{' '}
                  {release.trackCount === 1 ? 'track' : 'tracks'} ·{' '}
                  {release.platforms.length} platforms
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
