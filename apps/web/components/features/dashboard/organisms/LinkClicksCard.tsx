'use client';

import { useEffect, useState } from 'react';
import type { LinkClickStat } from '@/app/app/(shell)/dashboard/actions/link-clicks';
import { SocialIcon } from '@/components/atoms/SocialIcon';
import { ContentSurfaceCard } from '@/components/molecules/ContentSurfaceCard';
import { capitalizeFirst } from '@/lib/utils/string-utils';

/** Accent color rotation from DESIGN.md */
const ACCENT_COLORS = [
  'var(--color-accent-blue, #2563ff)',
  'var(--color-accent-purple, #8b1eff)',
  'var(--color-accent-pink, #d61a7f)',
  'var(--color-accent-red, #f3122d)',
  'var(--color-accent-orange, #ff9800)',
  'var(--color-accent-green, #2f9e44)',
] as const;

interface LinkClicksCardProps {
  readonly stats: LinkClickStat[];
  readonly total: number;
}

function formatCount(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(1).replace(/\.0$/, '')}k`;
  return String(n);
}

export function LinkClicksCard({ stats, total }: LinkClicksCardProps) {
  const [animated, setAnimated] = useState(false);
  const maxClicks = stats.length > 0 ? stats[0].clicks : 1;

  useEffect(() => {
    const frame = requestAnimationFrame(() => setAnimated(true));
    return () => cancelAnimationFrame(frame);
  }, []);

  if (stats.length === 0) {
    return (
      <ContentSurfaceCard className='p-4 sm:p-5'>
        <div className='flex items-baseline justify-between'>
          <h3 className='text-app font-caption text-secondary-token'>
            Link Clicks
          </h3>
        </div>
        <p className='mt-4 text-center text-app text-tertiary-token'>
          No link clicks yet. Share your profile to start tracking.
        </p>
      </ContentSurfaceCard>
    );
  }

  return (
    <ContentSurfaceCard className='p-4 sm:p-5' data-testid='link-clicks-card'>
      <div className='flex items-baseline justify-between'>
        <div>
          <h3 className='text-app font-caption text-secondary-token'>
            Link Clicks
          </h3>
          <p className='mt-0.5 text-2xs font-book text-tertiary-token'>
            Last 30 days
          </p>
        </div>
        <p className='text-2xl font-semibold tracking-[-0.04em] text-primary-token'>
          {total.toLocaleString()}
        </p>
      </div>

      <ul
        className='mt-4 list-none space-y-0 p-0'
        aria-label='Link clicks by platform'
      >
        {stats.map((stat, i) => {
          const accentColor = ACCENT_COLORS[i % ACCENT_COLORS.length];
          const widthPct = (stat.clicks / maxClicks) * 100;

          return (
            <li
              key={stat.platform}
              className='border-t border-subtle/40 py-2.5 first:border-t-0 first:pt-0'
            >
              <div className='flex items-center gap-2.5'>
                <div className='flex h-5 w-5 shrink-0 items-center justify-center text-tertiary-token'>
                  <SocialIcon
                    platform={stat.platform}
                    className='h-4 w-4 opacity-40 grayscale'
                    aria-hidden
                  />
                </div>
                <span className='flex-1 text-app font-book text-primary-token'>
                  {capitalizeFirst(stat.platform)}
                </span>
                <span className='text-app font-caption tabular-nums text-primary-token'>
                  {formatCount(stat.clicks)}
                </span>
              </div>
              <div className='mt-1.5 h-1 overflow-hidden rounded-full bg-white/[0.04]'>
                <div
                  className='h-full rounded-full transition-[width] duration-500 ease-[cubic-bezier(0.25,0.46,0.45,0.94)]'
                  style={{
                    width: animated ? `${widthPct}%` : '0%',
                    background: accentColor,
                    transitionDelay: `${i * 80}ms`,
                  }}
                />
              </div>
            </li>
          );
        })}
      </ul>
    </ContentSurfaceCard>
  );
}
