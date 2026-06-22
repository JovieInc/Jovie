'use client';

import { AppShellContentPanel } from '@/components/organisms/AppShellContentPanel';
import { DemoAuthShell } from './DemoAuthShell';
import { DEMO_RELEASE_VIEW_MODELS } from './mock-release-data';

const UTM_PRESETS = [
  { label: 'Instagram Story', detail: 'utm_source=instagram' },
  { label: 'TikTok Post', detail: 'utm_source=tiktok' },
  { label: 'Press Outreach', detail: 'utm_source=press' },
  { label: 'Paid Campaign', detail: 'utm_medium=paid' },
] as const;

export function DemoReleaseTrackedLinksSurface() {
  const release = DEMO_RELEASE_VIEW_MODELS[0];

  return (
    <DemoAuthShell>
      <AppShellContentPanel
        maxWidth='wide'
        frame='none'
        contentPadding='none'
        scroll='page'
        data-testid='demo-showcase-release-tracked-links'
      >
        <section className='overflow-hidden px-4 py-4 sm:px-5 sm:py-5'>
          <div
            className='mx-auto max-w-230 rounded-3xl border border-subtle bg-surface-0 p-5 shadow-[0_24px_80px_rgba(0,0,0,0.28)]'
            data-testid='demo-release-tracked-links-capture'
          >
            <div className='rounded-2xl border border-subtle bg-surface-1 px-4 py-3'>
              <p className='text-2xs font-medium tracking-tight text-tertiary-token'>
                Release row
              </p>
              <div className='mt-2 flex items-center justify-between gap-4'>
                <div>
                  <p className='text-sm font-semibold text-primary-token'>
                    {release.title}
                  </p>
                  <p className='text-xs text-secondary-token'>
                    {release.artistNames?.join(', ') ?? 'Unknown artist'}
                  </p>
                </div>
                <div className='rounded-full border border-subtle bg-surface-0 px-3 py-1.5 text-xs font-medium text-secondary-token'>
                  Share
                </div>
              </div>
            </div>

            <div className='relative mt-6 h-80'>
              <div className='absolute left-0 top-0 w-63 rounded-2xl border border-subtle bg-surface-0 p-2 shadow-[0_20px_60px_rgba(0,0,0,0.32)]'>
                <div className='rounded-xl bg-surface-1 px-3 py-2 text-xs font-semibold text-primary-token'>
                  Share
                </div>
                <div className='mt-2 rounded-xl bg-[color-mix(in_oklab,var(--linear-row-selected)_14%,transparent)] px-3 py-2 text-xs font-semibold text-primary-token'>
                  UTM
                </div>
              </div>

              <div className='absolute left-55 top-7 w-98 rounded-2xl border border-subtle bg-surface-0 p-2 shadow-[0_20px_60px_rgba(0,0,0,0.32)]'>
                <div className='rounded-xl bg-surface-1 px-3 py-2 text-xs font-semibold text-primary-token'>
                  UTM
                </div>
                <div className='mt-2 space-y-1'>
                  {UTM_PRESETS.map(preset => (
                    <div
                      key={preset.label}
                      className='flex items-center justify-between rounded-xl px-3 py-2'
                    >
                      <div>
                        <p className='text-xs font-semibold text-primary-token'>
                          {preset.label}
                        </p>
                        <p className='text-2xs text-secondary-token'>
                          {preset.detail}
                        </p>
                      </div>
                      <span className='rounded-full border border-subtle px-2.5 py-1 text-2xs font-medium text-secondary-token'>
                        Copy
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </section>
      </AppShellContentPanel>
    </DemoAuthShell>
  );
}
