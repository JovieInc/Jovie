'use client';

import { BellRing, CheckCheck, Mail } from 'lucide-react';
import Image from 'next/image';
import { NumberedSection } from '@/components/marketing';
import { MarketingScreenshot } from '@/components/marketing/MarketingScreenshot';
import { RELEASES } from './releases-data';

const SUB_ITEMS = [
  {
    number: '1.1',
    title: 'Smart Links',
    description:
      'Auto-generated for every release across Spotify, Apple Music, YouTube Music, and more.',
  },
  {
    number: '1.2',
    title: 'Release Notifications',
    description:
      'Fans get notified the minute new music drops — no manual sends, no scheduling.',
  },
  {
    number: '1.3',
    title: 'Pre-saves',
    description:
      'Capture intent before release day and convert it into day-one streams.',
  },
  {
    number: '1.4',
    title: 'Analytics',
    description:
      'See which platforms drive real engagement and where your listeners come from.',
  },
];

export function ReleasesSection() {
  const activeRelease = RELEASES[0];

  return (
    <NumberedSection
      id='release'
      sectionNumber='1.0'
      sectionTitle='Release'
      heading='Release day, automated.'
      description='Jovie launches the page, matches every platform, and starts fan outreach the moment your song drops.'
      subItems={SUB_ITEMS}
      className='relative overflow-hidden bg-page'
    >
      <div className='homepage-surface-card relative mt-4 overflow-hidden rounded-[1rem] p-3.5 sm:mt-5 sm:p-4 md:p-[1.15rem] lg:p-5'>
        <div
          aria-hidden='true'
          className='pointer-events-none absolute inset-x-0 top-0 h-px'
          style={{
            background:
              'linear-gradient(90deg, transparent, rgba(255,255,255,0.14) 32%, rgba(255,255,255,0.18) 50%, rgba(255,255,255,0.14) 68%, transparent)',
          }}
        />

        <div className='flex flex-wrap items-center justify-between gap-3 rounded-[0.9rem] border border-subtle bg-surface-1 px-3.5 py-2.75 sm:px-4'>
          <div>
            <p className='text-[11px] uppercase tracking-[0.08em] text-quaternary-token'>
              Release event
            </p>
            <p className='mt-1 text-sm font-medium text-primary-token'>
              {activeRelease.title} is live across your catalog.
            </p>
          </div>

          <div className='inline-flex items-center gap-2 rounded-full bg-emerald-500/12 px-3 py-1.5 text-sm font-medium text-emerald-300'>
            <BellRing className='h-4 w-4' />
            4,218 fans notified
          </div>
        </div>

        <div className='mt-3.5 grid gap-3.5 lg:grid-cols-[minmax(0,1.08fr)_15.5rem] lg:items-start xl:grid-cols-[minmax(0,1.06fr)_16.25rem]'>
          <div className='space-y-3'>
            <div className='max-w-[42rem]'>
              <MarketingScreenshot
                scenarioId='dashboard-releases-desktop'
                altOverride='Jovie releases dashboard showing catalog with smart links'
                width={2880}
                height={1800}
                title='Jovie - Release Flow'
                priority
              />
            </div>

            <div className='flex items-center gap-3 rounded-[0.9rem] border border-subtle bg-surface-1 px-4 py-3 lg:hidden'>
              <div className='relative h-12 w-12 shrink-0 overflow-hidden rounded-xl bg-surface-2'>
                <Image
                  src={activeRelease.artwork}
                  alt={activeRelease.title}
                  fill
                  sizes='48px'
                  className='object-cover'
                />
              </div>
              <div className='min-w-0'>
                <p className='text-sm font-medium text-primary-token'>
                  Smart link live for {activeRelease.title}
                </p>
                <p className='text-sm text-secondary-token'>
                  Auto-matched across Spotify, Apple Music, and YouTube Music.
                </p>
              </div>
            </div>
          </div>

          <div className='grid gap-2.5 sm:grid-cols-2 lg:grid-cols-1'>
            <div className='rounded-[0.9rem] border border-subtle bg-surface-1 p-3.5'>
              <p className='text-[11px] uppercase tracking-[0.08em] text-quaternary-token'>
                Paid release notifications
              </p>
              <p className='mt-2 text-[1.6rem] font-semibold tracking-tight text-primary-token'>
                4,218
              </p>
              <p className='text-sm font-medium text-secondary-token'>
                fans notified
              </p>
              <p className='mt-2 text-xs leading-5 text-tertiary-token'>
                The minute the release is live, Jovie starts the outreach for
                you.
              </p>
            </div>

            <div className='rounded-[0.9rem] border border-subtle bg-surface-1 p-3.5'>
              <div className='flex items-start gap-3'>
                <span className='inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-500/12 text-emerald-300'>
                  <Mail className='h-4 w-4' />
                </span>
                <div className='min-w-0'>
                  <p className='text-[11px] uppercase tracking-[0.08em] text-quaternary-token'>
                    Release email
                  </p>
                  <p className='mt-1 text-sm font-medium text-primary-token'>
                    New release from Tim White
                  </p>
                  <p className='mt-1 text-sm leading-6 text-secondary-token'>
                    {activeRelease.title} is out now. Fans already have the
                    smart link in their inbox.
                  </p>
                  <div className='mt-2.5 inline-flex items-center gap-2 rounded-full bg-emerald-500/12 px-2.5 py-1 text-[11px] font-medium text-emerald-300'>
                    <CheckCheck className='h-3 w-3' />
                    Sent automatically by Jovie
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </NumberedSection>
  );
}
