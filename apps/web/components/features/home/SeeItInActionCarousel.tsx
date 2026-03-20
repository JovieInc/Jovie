'use client';

import { Popover, PopoverContent, PopoverTrigger } from '@jovie/ui';
import Image from 'next/image';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { DSP_LOGO_CONFIG } from '@/components/atoms/DspLogo';
import { Container } from '@/components/site/Container';
import { SmartLinkProviderButton } from '@/features/release/SmartLinkProviderButton';

const BLUR_DATA_URL =
  'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMTIwIiBoZWlnaHQ9IjEyMCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48cmVjdCB3aWR0aD0iMTAwJSIgaGVpZ2h0PSIxMDAlIiBmaWxsPSIjMWExYTFhIi8+PC9zdmc+';

const HOVER_MEDIA_QUERY = '(hover: hover) and (pointer: fine)';

const PROFILE = {
  name: 'Tim White',
  role: 'Artist',
  handle: 'tim',
  avatarSrc: '/images/avatars/tim-white.jpg',
  profilePath: '/tim',
} as const;

const RELEASES = [
  {
    id: 'never-say-a-word',
    title: 'Never Say A Word',
    year: '2024',
    type: 'Single',
    artwork: 'https://i.scdn.co/image/ab67616d0000b273cbe401fd4a00b05b26a5233f',
    slug: 'never-say-a-word',
  },
  {
    id: 'deep-end',
    title: 'The Deep End',
    year: '2017',
    type: 'Single',
    artwork: 'https://i.scdn.co/image/ab67616d0000b273164aac758a1deb79d33cc1b4',
    slug: 'the-deep-end',
  },
  {
    id: 'take-me-over',
    title: 'Take Me Over',
    year: '2014',
    type: 'Single',
    artwork: 'https://i.scdn.co/image/ab67616d0000b2732c05c3b2fb08c606843e7d98',
    slug: 'take-me-over',
  },
] as const;

const SMART_LINK_DSPS = [
  'spotify',
  'apple_music',
  'youtube_music',
  'amazon_music',
] as const;

const DSP_LABELS: Record<(typeof SMART_LINK_DSPS)[number], string> = {
  spotify: 'Spotify',
  apple_music: 'Apple Music',
  youtube_music: 'YouTube Music',
  amazon_music: 'Amazon Music',
};

type Release = (typeof RELEASES)[number];

function useHoverCapable() {
  const [isHoverCapable, setIsHoverCapable] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) {
      return;
    }

    const mediaQueryList = window.matchMedia(HOVER_MEDIA_QUERY);
    const update = (event?: MediaQueryListEvent) => {
      setIsHoverCapable(event?.matches ?? mediaQueryList.matches);
    };

    update();
    mediaQueryList.addEventListener('change', update);

    return () => {
      mediaQueryList.removeEventListener('change', update);
    };
  }, []);

  return isHoverCapable;
}

function ReleasePopoverContent({
  release,
  isHoverCapable,
  onHoverStart,
  onHoverEnd,
}: Readonly<{
  release: Release;
  isHoverCapable: boolean;
  onHoverStart: () => void;
  onHoverEnd: () => void;
}>) {
  const releaseHref = `${PROFILE.profilePath}/${release.slug}`;

  return (
    <PopoverContent
      side='top'
      sideOffset={14}
      disablePortal
      onMouseEnter={() => {
        if (isHoverCapable) {
          onHoverStart();
        }
      }}
      onMouseLeave={() => {
        if (isHoverCapable) {
          onHoverEnd();
        }
      }}
      className='w-[20rem] max-w-[calc(100vw-2rem)] rounded-xl border border-subtle bg-surface-0 p-4 shadow-card-elevated'
    >
      <div className='flex items-start gap-4'>
        <div className='relative h-20 w-20 shrink-0 overflow-hidden rounded-xl'>
          <Image
            src={release.artwork}
            alt={`${release.title} artwork`}
            fill
            sizes='80px'
            className='object-cover'
          />
        </div>
        <div className='min-w-0'>
          <p className='text-[15px] font-medium text-primary-token'>
            {release.title}
          </p>
          <p className='mt-1 text-sm text-tertiary-token'>{PROFILE.name}</p>
          <p className='mt-2 text-[12px] font-mono text-tertiary-token'>
            jov.ie/{PROFILE.handle}/{release.slug}
          </p>
        </div>
      </div>

      <div className='mt-4 flex flex-col gap-2.5'>
        {SMART_LINK_DSPS.map(provider => {
          const config = DSP_LOGO_CONFIG[provider];
          if (!config) return null;

          return (
            <SmartLinkProviderButton
              key={provider}
              label={DSP_LABELS[provider]}
              iconPath={config.iconPath}
              href={releaseHref}
              className='bg-surface-1 ring-[color:var(--linear-border-subtle)] hover:bg-hover'
            />
          );
        })}
      </div>

      <Link
        href={releaseHref}
        className='mt-4 inline-flex text-sm font-medium text-secondary-token transition-colors duration-[var(--linear-duration-normal)] hover:text-primary-token'
      >
        All platforms
      </Link>
    </PopoverContent>
  );
}

function ReleaseCard({
  release,
  isHoverCapable,
  isOpen,
  onOpenChange,
  onHoverStart,
  onHoverEnd,
}: Readonly<{
  release: Release;
  isHoverCapable: boolean;
  isOpen: boolean;
  onOpenChange: (releaseId: string, nextOpen: boolean) => void;
  onHoverStart: (releaseId: string) => void;
  onHoverEnd: (releaseId: string) => void;
}>) {
  return (
    <Popover
      open={isOpen}
      onOpenChange={nextOpen => onOpenChange(release.id, nextOpen)}
    >
      <div className='relative'>
        <PopoverTrigger asChild>
          <button
            type='button'
            aria-label={`Open ${release.title} smart link preview`}
            onMouseEnter={() => {
              if (isHoverCapable) {
                onHoverStart(release.id);
              }
            }}
            onMouseLeave={() => {
              if (isHoverCapable) {
                onHoverEnd(release.id);
              }
            }}
            className='group flex w-full flex-col rounded-xl p-6 text-left transition-all duration-[var(--linear-duration-normal)] hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--linear-text-secondary)]'
            style={{
              backgroundColor: 'var(--linear-bg-surface-0)',
              border: '1px solid var(--linear-border-subtle)',
              boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
            }}
          >
            <div className='relative aspect-square w-full overflow-hidden rounded-lg'>
              <Image
                src={release.artwork}
                alt={`${release.title} artwork`}
                fill
                sizes='(min-width: 768px) 240px, 100vw'
                className='object-cover transition-transform duration-[var(--linear-duration-normal)] group-hover:scale-[1.02]'
              />
            </div>
            <div className='mt-4'>
              <p className='text-[15px] font-medium text-primary-token'>
                {release.title}
              </p>
              <p className='mt-1 text-sm text-secondary-token'>
                {release.type} / {release.year}
              </p>
              <p className='mt-3 text-[13px] font-mono text-tertiary-token'>
                jov.ie/{PROFILE.handle}/{release.slug}
              </p>
            </div>
          </button>
        </PopoverTrigger>

        <ReleasePopoverContent
          release={release}
          isHoverCapable={isHoverCapable}
          onHoverStart={() => onHoverStart(release.id)}
          onHoverEnd={() => onHoverEnd(release.id)}
        />
      </div>
    </Popover>
  );
}

export function SeeItInActionCarousel() {
  const isHoverCapable = useHoverCapable();
  const [openReleaseId, setOpenReleaseId] = useState<string | null>(null);
  const closeTimeoutRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (closeTimeoutRef.current !== null) {
        window.clearTimeout(closeTimeoutRef.current);
      }
    };
  }, []);

  const handleReleaseOpenChange = (releaseId: string, nextOpen: boolean) => {
    if (closeTimeoutRef.current !== null) {
      window.clearTimeout(closeTimeoutRef.current);
      closeTimeoutRef.current = null;
    }

    setOpenReleaseId(currentOpenReleaseId =>
      nextOpen
        ? releaseId
        : currentOpenReleaseId === releaseId
          ? null
          : currentOpenReleaseId
    );
  };

  const handleReleaseHoverStart = (releaseId: string) => {
    if (closeTimeoutRef.current !== null) {
      window.clearTimeout(closeTimeoutRef.current);
      closeTimeoutRef.current = null;
    }

    setOpenReleaseId(releaseId);
  };

  const handleReleaseHoverEnd = (releaseId: string) => {
    if (closeTimeoutRef.current !== null) {
      window.clearTimeout(closeTimeoutRef.current);
    }

    closeTimeoutRef.current = window.setTimeout(() => {
      setOpenReleaseId(currentOpenReleaseId =>
        currentOpenReleaseId === releaseId ? null : currentOpenReleaseId
      );
      closeTimeoutRef.current = null;
    }, 120);
  };

  return (
    <section className='section-spacing-linear-sm relative overflow-hidden bg-page'>
      <div
        aria-hidden='true'
        className='pointer-events-none absolute left-1/2 top-1/3 h-[34rem] w-[48rem] -translate-x-1/2 -translate-y-1/2 rounded-full'
        style={{
          background:
            'radial-gradient(ellipse at center, oklch(18% 0.02 265 / 0.12), transparent 68%)',
        }}
      />

      <Container size='homepage'>
        <div className='relative mx-auto max-w-[var(--linear-content-max)]'>
          <div className='flex flex-col items-center gap-5 text-center reveal-on-scroll'>
            <h2 className='marketing-h2-linear text-primary-token'>
              See it in action
            </h2>
            <p className='max-w-2xl marketing-lead-linear text-secondary-token'>
              Tim White&apos;s profile, releases, and smart links all powered by
              Jovie.
            </p>
          </div>

          <div
            className='mx-auto mt-12 max-w-2xl reveal-on-scroll'
            data-delay='40'
          >
            <div
              className='rounded-xl p-6'
              style={{
                backgroundColor: 'var(--linear-bg-surface-0)',
                border: '1px solid var(--linear-border-subtle)',
                boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
              }}
            >
              <div className='flex flex-col items-center text-center'>
                <div className='relative h-24 w-24 overflow-hidden rounded-full'>
                  <Image
                    src={PROFILE.avatarSrc}
                    alt={`${PROFILE.name} profile photo`}
                    fill
                    sizes='96px'
                    placeholder='blur'
                    blurDataURL={BLUR_DATA_URL}
                    className='object-cover'
                  />
                </div>
                <p className='mt-4 text-xl font-medium text-primary-token'>
                  {PROFILE.name}
                </p>
                <p className='mt-1 text-sm text-tertiary-token'>
                  {PROFILE.role}
                </p>
                <Link
                  href={PROFILE.profilePath}
                  className='mt-4 inline-flex items-center gap-2 text-[13px] font-mono text-secondary-token transition-colors duration-[var(--linear-duration-normal)] hover:text-primary-token'
                >
                  <span
                    aria-hidden='true'
                    className='h-2 w-2 rounded-full bg-emerald-500 animate-pulse'
                  />
                  jov.ie/{PROFILE.handle}
                </Link>
                <Link
                  href={PROFILE.profilePath}
                  className='mt-5 inline-flex items-center rounded-lg border border-subtle bg-surface-1 px-4 py-2 text-sm font-medium text-primary-token transition-colors duration-[var(--linear-duration-normal)] hover:bg-hover'
                >
                  View Profile
                </Link>
              </div>
            </div>
          </div>

          <div
            className='mt-10 grid grid-cols-1 gap-6 md:grid-cols-3 reveal-on-scroll'
            data-delay='80'
          >
            {RELEASES.map(release => (
              <ReleaseCard
                key={release.id}
                release={release}
                isHoverCapable={isHoverCapable}
                isOpen={openReleaseId === release.id}
                onOpenChange={handleReleaseOpenChange}
                onHoverStart={handleReleaseHoverStart}
                onHoverEnd={handleReleaseHoverEnd}
              />
            ))}
          </div>
        </div>
      </Container>
    </section>
  );
}
