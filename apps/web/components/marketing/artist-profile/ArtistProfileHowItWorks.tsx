'use client';

import { Popover, PopoverContent, PopoverTrigger } from '@jovie/ui';
import { CheckCircle2, QrCode, Search } from 'lucide-react';
import { type ReactNode, useEffect, useState } from 'react';
import { ProviderIcon } from '@/components/atoms/ProviderIcon';
import { CopyableUrlRow } from '@/components/molecules/CopyableUrlRow';
import { DrawerSurfaceCard } from '@/components/molecules/drawer';
import type { ArtistProfileLandingCopy } from '@/data/artistProfileCopy';
import { useReducedMotion } from '@/lib/hooks/useReducedMotion';
import { cn } from '@/lib/utils';
import { ArtistProfileSectionHeader } from './ArtistProfileSectionHeader';
import { ArtistProfileSectionShell } from './ArtistProfileSectionShell';

interface ArtistProfileHowItWorksProps {
  readonly howItWorks: ArtistProfileLandingCopy['howItWorks'];
}
export function ArtistProfileHowItWorks({
  howItWorks,
}: Readonly<ArtistProfileHowItWorksProps>) {
  const reducedMotion = useReducedMotion();
  const [progress, setProgress] = useState(howItWorks.sync.startProgress);

  useEffect(() => {
    if (reducedMotion) {
      setProgress(howItWorks.sync.endProgress);
      return;
    }

    const timer = globalThis.setTimeout(() => {
      setProgress(howItWorks.sync.endProgress);
    }, 220);

    return () => {
      globalThis.clearTimeout(timer);
    };
  }, [
    howItWorks.sync.endProgress,
    howItWorks.sync.startProgress,
    reducedMotion,
  ]);

  return (
    <ArtistProfileSectionShell className='bg-white/[0.008] py-24 sm:py-28 lg:py-32'>
      <div className='mx-auto max-w-[1120px]'>
        <ArtistProfileSectionHeader
          align='left'
          headline={howItWorks.headline}
          body={howItWorks.body}
          className='max-w-[40rem]'
          headlineClassName='max-w-none text-[clamp(2.8rem,4.8vw,4.35rem)]'
          bodyClassName='max-w-[30rem]'
        />

        <div className='mt-12 grid gap-6 lg:grid-cols-3 lg:gap-5'>
          <article className='flex flex-col gap-4'>
            <StepNumber value={1} />
            <div className='relative min-h-[11.75rem] space-y-3 pt-1'>
              <div
                aria-hidden='true'
                className='pointer-events-none absolute inset-x-8 top-4 h-14 rounded-full bg-white/8 blur-3xl'
              />
              <div className='flex h-11 items-center gap-3 rounded-full border border-(--linear-app-frame-seam) bg-surface-0 px-4'>
                <Search
                  className='h-4 w-4 text-tertiary-token'
                  strokeWidth={1.85}
                />
                <span className='text-[13px] font-medium text-primary-token'>
                  {howItWorks.claim.searchValue}
                </span>
              </div>
              <DrawerSurfaceCard
                variant='card'
                className='rounded-[0.95rem] p-2.5'
              >
                <div className='flex items-center gap-3'>
                  <span className='flex h-10 w-10 items-center justify-center rounded-full bg-[#1DB954]/12'>
                    <ProviderIcon provider='spotify' className='h-4.5 w-4.5' />
                  </span>
                  <div className='min-w-0 flex-1'>
                    <p className='truncate text-[13px] font-semibold text-primary-token'>
                      {howItWorks.claim.resultName}
                    </p>
                    <p className='text-[11px] text-secondary-token'>
                      {howItWorks.claim.resultSubtitle}
                    </p>
                  </div>
                  <span className='rounded-full bg-white px-3 py-1.5 text-[11px] font-semibold text-black'>
                    {howItWorks.claim.ctaLabel}
                  </span>
                </div>
              </DrawerSurfaceCard>
              <div className='flex items-center justify-between rounded-[0.95rem] border border-(--linear-app-frame-seam) bg-surface-0 px-3.5 py-3'>
                <p className='font-mono text-[12px] font-medium tracking-[-0.02em] text-secondary-token'>
                  {howItWorks.claim.profilePath}
                </p>
                <CheckCircle2
                  className='h-4 w-4 text-success'
                  strokeWidth={2}
                />
              </div>
            </div>
            <div>
              <p className='text-[15px] font-semibold tracking-[-0.03em] text-primary-token'>
                {howItWorks.steps[0]?.title}
              </p>
              <p className='mt-1.5 text-[13px] leading-[1.6] text-secondary-token'>
                {howItWorks.steps[0]?.description}
              </p>
            </div>
          </article>

          <article className='flex flex-col gap-4'>
            <StepNumber value={2} />
            <DrawerSurfaceCard
              variant='card'
              className='rounded-[1.15rem] p-3.5'
            >
              <div className='flex items-center justify-between gap-3'>
                <div>
                  <p className='text-[13px] font-semibold text-primary-token'>
                    Importing {howItWorks.sync.artistName}
                  </p>
                  <p className='mt-1 text-[11px] text-secondary-token'>
                    Matching providers and pulling the catalog into place.
                  </p>
                </div>
                <p className='text-[12px] font-semibold text-primary-token'>
                  {progress}%
                </p>
              </div>
              <div className='mt-3 h-2 overflow-hidden rounded-full bg-[#1DB954]/10'>
                <div
                  className='h-full rounded-full bg-[#1DB954] transition-[width] duration-700 ease-out'
                  style={{ width: `${progress}%` }}
                />
              </div>
              <div className='mt-3 space-y-2'>
                {howItWorks.sync.providers.map(provider => (
                  <div
                    key={provider.provider}
                    className='flex items-center justify-between rounded-[0.95rem] border border-(--linear-app-frame-seam) bg-surface-0 px-3.5 py-3'
                  >
                    <div className='flex items-center gap-3'>
                      <ProviderIcon
                        provider={provider.provider}
                        className='h-4.5 w-4.5'
                      />
                      <p className='text-[13px] font-medium text-primary-token'>
                        {provider.provider === 'apple_music'
                          ? 'Apple Music'
                          : provider.provider === 'deezer'
                            ? 'Deezer'
                            : 'Spotify'}
                      </p>
                    </div>
                    <span
                      className={cn(
                        'rounded-full px-2.5 py-1 text-[10px] font-semibold',
                        provider.status === 'Ingesting'
                          ? 'border border-accent/18 bg-[#20172e] text-[#d7b8ff]'
                          : 'bg-white/6 text-secondary-token'
                      )}
                    >
                      {provider.status}
                    </span>
                  </div>
                ))}
              </div>
              <p className='mt-3 text-[12px] font-medium tracking-[-0.02em] text-secondary-token'>
                {howItWorks.sync.otherProvidersLabel}
              </p>
            </DrawerSurfaceCard>
            <div>
              <p className='text-[15px] font-semibold tracking-[-0.03em] text-primary-token'>
                {howItWorks.steps[1]?.title}
              </p>
              <p className='mt-1.5 text-[13px] leading-[1.6] text-secondary-token'>
                {howItWorks.steps[1]?.description}
              </p>
            </div>
          </article>

          <article className='flex flex-col gap-4'>
            <StepNumber value={3} />
            <div className='relative min-h-[11.75rem] space-y-3 pt-1'>
              <div
                aria-hidden='true'
                className='pointer-events-none absolute inset-x-8 top-4 h-14 rounded-full bg-white/8 blur-3xl'
              />
              <CopyableUrlRow
                url={howItWorks.share.url}
                displayValue={howItWorks.share.displayValue}
                className='rounded-[10px] border border-(--linear-app-frame-seam) bg-surface-0'
                valueClassName='text-secondary-token'
                surface='boxed'
              />
              <div className='mt-3 flex flex-wrap gap-2'>
                <HoverPopover
                  label={howItWorks.share.qrLabel}
                  content={
                    <div className='rounded-[0.9rem] bg-white p-2.5 shadow-[0_14px_32px_rgba(0,0,0,0.16)]'>
                      <div className='grid grid-cols-7 gap-[5px]'>
                        {QR_CELLS.map(cell => (
                          <span
                            key={cell.id}
                            className='h-2.5 w-2.5 rounded-[2px]'
                            style={{
                              backgroundColor: cell.filled
                                ? '#0b0b0b'
                                : '#f3f2ee',
                            }}
                          />
                        ))}
                      </div>
                    </div>
                  }
                />
                <HoverPopover
                  label={howItWorks.share.deepLinksLabel}
                  content={
                    <div className='space-y-1.5'>
                      {howItWorks.share.deepLinks.map(link => (
                        <p
                          key={link}
                          className='font-mono text-[11px] tracking-[-0.01em] text-primary-token'
                        >
                          {link}
                        </p>
                      ))}
                    </div>
                  }
                />
              </div>
            </div>
            <div>
              <p className='text-[15px] font-semibold tracking-[-0.03em] text-primary-token'>
                {howItWorks.steps[2]?.title}
              </p>
              <p className='mt-1.5 text-[13px] leading-[1.6] text-secondary-token'>
                {howItWorks.steps[2]?.description}
              </p>
            </div>
          </article>
        </div>
      </div>
    </ArtistProfileSectionShell>
  );
}

function StepNumber({ value }: Readonly<{ value: number }>) {
  return (
    <span className='text-[2.15rem] font-semibold leading-none tracking-[-0.08em] text-primary-token'>
      {value}
    </span>
  );
}

function HoverPopover({
  label,
  content,
}: Readonly<{
  label: string;
  content: ReactNode;
}>) {
  const [open, setOpen] = useState(false);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type='button'
          onMouseEnter={() => setOpen(true)}
          onMouseLeave={() => setOpen(false)}
          onFocus={() => setOpen(true)}
          onBlur={() => setOpen(false)}
          className='inline-flex items-center gap-1.5 rounded-full border border-(--linear-app-frame-seam) bg-surface-0 px-3 py-1.5 text-[11px] font-medium text-secondary-token transition-colors hover:bg-surface-1'
        >
          {label === 'QR code' ? (
            <QrCode className='h-3.5 w-3.5' strokeWidth={1.85} />
          ) : null}
          {label}
        </button>
      </PopoverTrigger>
      <PopoverContent
        side='bottom'
        align='start'
        showArrow
        className='w-auto rounded-[1rem] border border-(--linear-app-frame-seam) bg-(--linear-app-content-surface) p-3 shadow-[0_22px_54px_rgba(0,0,0,0.24)]'
      >
        {content}
      </PopoverContent>
    </Popover>
  );
}

const QR_PATTERN = [
  '1110111',
  '1010101',
  '1110111',
  '0001000',
  '1111101',
  '1010001',
  '1110111',
] as const;

const QR_CELLS = QR_PATTERN.flatMap((row, rowIndex) =>
  row.split('').map((cell, cellIndex) => ({
    id: `r${rowIndex}c${cellIndex}`,
    filled: cell === '1',
  }))
);
