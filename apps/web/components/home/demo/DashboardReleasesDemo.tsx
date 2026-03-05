'use client';

import { useEffect, useRef, useState } from 'react';
import { SocialIcon } from '@/components/atoms/SocialIcon';
import { DSP_CONFIGS } from '@/lib/dsp';
import { RELEASES } from './mock-data';

const PROVIDER_KEYS = [
  'spotify',
  'apple_music',
  'youtube_music',
  'deezer',
] as const;

/**
 * Releases management demo showing a discography table.
 * Uses real SocialIcon provider dots matching the ReleaseTable pattern.
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
      <div className='overflow-hidden rounded-lg border border-subtle bg-surface-0'>
        {/* Header */}
        <div className='flex items-center justify-between border-b border-subtle bg-surface-1 px-4 py-3'>
          <p className='text-xs font-medium text-secondary-token'>
            {RELEASES.length} releases
          </p>
          <div className='rounded-md bg-btn-primary px-2.5 py-1 text-[11px] font-medium text-btn-primary-foreground'>
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
                  <p className='truncate text-sm font-medium text-primary-token'>
                    {release.title}
                  </p>
                  <span className='shrink-0 rounded-full bg-surface-2 px-1.5 py-0.5 text-[10px] font-medium text-secondary-token'>
                    {release.type}
                  </span>
                </div>
                <p className='mt-0.5 text-[11px] text-tertiary-token'>
                  {release.date} · {release.trackCount}{' '}
                  {release.trackCount === 1 ? 'track' : 'tracks'}
                </p>
              </div>

              {/* Provider dots — matches real ReleaseTable */}
              <div className='hidden sm:flex items-center gap-1'>
                {PROVIDER_KEYS.map(key => {
                  const config = DSP_CONFIGS[key];
                  const isAvailable = release.platforms.some(
                    p =>
                      p.toLowerCase().replace(/\s+/g, '_') === key ||
                      p.toLowerCase().replace(/\s+/g, '') ===
                        key.replace(/_/g, '')
                  );
                  return (
                    <span
                      key={key}
                      className='inline-flex h-5 w-5 items-center justify-center rounded-full'
                      style={{
                        backgroundColor: isAvailable
                          ? `${config?.color ?? '#888'}20`
                          : 'var(--color-bg-surface-2)',
                        color: isAvailable
                          ? config?.color
                          : 'var(--color-text-tertiary-token)',
                        opacity: isAvailable ? 1 : 0.3,
                      }}
                      title={config?.name}
                    >
                      <SocialIcon
                        platform={key}
                        className='h-3 w-3'
                        aria-hidden
                      />
                    </span>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
