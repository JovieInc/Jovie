'use client';

import Image from 'next/image';
import Link from 'next/link';
import { Container } from '@/components/site/Container';

const BLUR_DATA_URL =
  'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMTIwIiBoZWlnaHQ9IjEyMCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48cmVjdCB3aWR0aD0iMTAwJSIgaGVpZ2h0PSIxMDAlIiBmaWxsPSIjMWExYTFhIi8+PC9zdmc+';

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

interface SeeItInActionCarouselProps {
  readonly creators?: unknown[];
}

export function SeeItInActionCarousel({
  creators: _creators,
}: Readonly<SeeItInActionCarouselProps>) {
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
                    className='h-2 w-2 animate-pulse rounded-full bg-emerald-500'
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
              <Link
                key={release.id}
                href={`${PROFILE.profilePath}/${release.slug}`}
                className='group flex flex-col rounded-xl p-6 text-left transition-all duration-[var(--linear-duration-normal)] hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--linear-text-secondary)]'
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
              </Link>
            ))}
          </div>
        </div>
      </Container>
    </section>
  );
}
