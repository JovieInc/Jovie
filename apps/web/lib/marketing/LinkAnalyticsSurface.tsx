'use client';

import { useState } from 'react';
import { ReleaseSmartLinkAnalytics } from '@/components/organisms/release-sidebar/ReleaseSmartLinkAnalytics';
import { Sparkline } from '@/components/shell/Sparkline';
import {
  LINK_ANALYTICS_DEMO,
  LINK_ANALYTICS_DEMO_DAYS,
  LINK_ANALYTICS_DEMO_NOW,
  LINK_ANALYTICS_DEMO_RECENT,
  LINK_ANALYTICS_DEMO_RELEASE,
} from '@/data/marketing/link-analytics-demo';
import { PROVIDER_LABELS } from '@/lib/discography/provider-labels';
import { formatShortDateUTC } from '@/lib/utils/date-formatting';

/**
 * Shipped smart-link analytics panel with a fixed click fixture.
 * The override skips the dashboard fetch so the first render is ready.
 */
export function LinkAnalyticsSurface() {
  const [range, setRange] = useState<7 | 30>(7);
  const days = LINK_ANALYTICS_DEMO_DAYS.slice(-range);
  const clicks = days.reduce((sum, day) => sum + day.clicks, 0);

  return (
    <div className='space-y-4 text-sm text-primary-token'>
      <p className='text-xs text-secondary-token'>
        Demo data · {formatShortDateUTC(LINK_ANALYTICS_DEMO_NOW)} · UTC
      </p>
      <ReleaseSmartLinkAnalytics
        analyticsOverride={LINK_ANALYTICS_DEMO}
        release={LINK_ANALYTICS_DEMO_RELEASE}
        variant='flat'
        fixedLastClickDate
      />
      <div>
        <div className='flex items-center justify-between gap-2'>
          <p className='tabular-nums' aria-live='polite'>
            {clicks.toLocaleString('en-US')} clicks in {range} days
          </p>
          <fieldset className='flex gap-2' aria-label='Demo date range'>
            {([7, 30] as const).map(value => (
              <button
                key={value}
                type='button'
                aria-pressed={range === value}
                onClick={() => setRange(value)}
                className='min-h-11 rounded-md px-2 text-xs text-secondary-token hover:text-primary-token focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus'
              >
                {value} days
              </button>
            ))}
          </fieldset>
        </div>
        <Sparkline
          points={days.map(day => day.clicks)}
          trend={days[days.length - 1].clicks >= days[0].clicks ? 'up' : 'down'}
          ariaLabel={`Clicks over time: ${clicks} clicks in ${range} days`}
          className='block h-24 w-full'
        />
        <div className='mt-2 flex justify-between text-xs text-secondary-token'>
          <span>{formatShortDateUTC(days[0].date)}</span>
          <span>{formatShortDateUTC(days[days.length - 1].date)}</span>
        </div>
      </div>
      <dl className='space-y-2 border-t border-subtle pt-3'>
        {LINK_ANALYTICS_DEMO.providerClicks.map(({ provider, clicks }) => (
          <div key={provider} className='flex justify-between gap-3'>
            <dt>{PROVIDER_LABELS[provider] ?? provider}</dt>
            <dd className='tabular-nums'>{clicks.toLocaleString('en-US')}</dd>
          </div>
        ))}
      </dl>
      <div className='border-t border-subtle pt-3'>
        <h2 className='text-sm font-medium text-balance'>Recent clicks</h2>
        <ul className='mt-2 space-y-2 text-xs text-secondary-token'>
          {LINK_ANALYTICS_DEMO_RECENT.map(click => (
            <li key={click.at} className='flex justify-between gap-3'>
              <span>Harbor → {click.provider}</span>
              <time dateTime={click.at} className='tabular-nums'>
                {click.at.slice(11, 16)} UTC
              </time>
            </li>
          ))}
        </ul>
      </div>
      <div className='border-t border-subtle pt-3'>
        <h2 className='text-sm font-medium text-balance'>UTM links and ISRC</h2>
        <p className='mt-2 text-xs text-secondary-token'>
          UTM parameters label campaign links. ISRC identifies a recording.
          Clicks measure visits to a provider, not streams or unique listeners.
        </p>
      </div>
    </div>
  );
}
