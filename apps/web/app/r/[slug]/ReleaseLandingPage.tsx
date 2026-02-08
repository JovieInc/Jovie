/**
 * ReleaseLandingPage Component
 *
 * A public-facing landing page for release smart links.
 * Shows release artwork, title, artist info, and streaming platform buttons.
 *
 * Server component — renders entirely on the server with zero client JS.
 * Uses design system tokens for light/dark mode support.
 */

import Image from 'next/image';
import Link from 'next/link';
import { Icon } from '@/components/atoms/Icon';
import { ProviderIcon } from '@/components/atoms/ProviderIcon';
import type { ProviderKey } from '@/lib/discography/types';

interface Provider {
  key: ProviderKey;
  label: string;
  accent: string;
  url: string | null;
}

interface ReleaseLandingPageProps
  extends Readonly<{
    readonly release: {
      readonly title: string;
      readonly artworkUrl: string | null;
      readonly releaseDate: string | null;
    };
    readonly artist: {
      readonly name: string;
      readonly avatarUrl: string | null;
    };
    readonly providers: Provider[];
    readonly slug: string;
  }> {}

export function ReleaseLandingPage({
  release,
  artist,
  providers,
  slug,
}: Readonly<ReleaseLandingPageProps>) {
  const formattedDate = release.releaseDate
    ? new Date(release.releaseDate).toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
      })
    : null;

  return (
    <div className='min-h-screen bg-base text-primary-token'>
      {/* Ambient glow background */}
      <div className='pointer-events-none fixed inset-0'>
        <div className='absolute left-1/2 top-1/3 h-[500px] w-[500px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-accent/[0.04] blur-3xl dark:bg-accent/[0.06]' />
      </div>

      <main className='relative z-10 flex min-h-screen flex-col items-center justify-center px-4 py-8'>
        <div className='w-full max-w-sm space-y-5'>
          {/* Release Artwork */}
          <div className='relative aspect-square w-full overflow-hidden rounded-[20px] border border-default bg-surface-0 shadow-xl'>
            {release.artworkUrl ? (
              <Image
                src={release.artworkUrl}
                alt={`${release.title} artwork`}
                fill
                className='object-cover'
                sizes='(max-width: 384px) 100vw, 384px'
                priority
              />
            ) : (
              <div className='flex h-full w-full items-center justify-center'>
                <Icon
                  name='Disc3'
                  className='h-20 w-20 text-quaternary-token'
                  aria-hidden='true'
                />
              </div>
            )}
          </div>

          {/* Release Info */}
          <div className='text-center'>
            <h1 className='text-xl font-semibold tracking-tight sm:text-2xl'>
              {release.title}
            </h1>
            <p className='mt-1.5 text-base text-secondary-token'>
              {artist.name}
            </p>
            {formattedDate && (
              <p className='mt-1 text-xs text-tertiary-token'>
                {formattedDate}
              </p>
            )}
          </div>

          {/* Streaming Platform Buttons */}
          <div className='space-y-2.5'>
            {providers.map(provider => (
              <a
                key={provider.key}
                href={provider.url ?? '#'}
                target='_blank'
                rel='noopener noreferrer'
                className='group flex w-full items-center gap-3 rounded-2xl border border-subtle bg-surface-1 px-4 py-3 transition-all hover:border-default hover:bg-interactive-hover'
              >
                <span
                  className='flex h-11 w-11 shrink-0 items-center justify-center rounded-xl'
                  style={{
                    background: `linear-gradient(135deg, ${provider.accent}20, ${provider.accent}0a)`,
                    color: provider.accent,
                  }}
                >
                  <ProviderIcon provider={provider.key} className='h-5 w-5' />
                </span>
                <span className='flex-1 text-left'>
                  <span className='block text-[15px] font-medium text-primary-token'>
                    {provider.label}
                  </span>
                  <span className='block text-xs text-tertiary-token'>
                    Play
                  </span>
                </span>
                <Icon
                  name='ChevronRight'
                  className='h-4 w-4 text-quaternary-token transition-transform group-hover:translate-x-0.5'
                  aria-hidden='true'
                />
              </a>
            ))}
          </div>

          {/* Empty state if no providers */}
          {providers.length === 0 && (
            <div className='rounded-2xl border border-subtle bg-surface-1 p-6 text-center'>
              <Icon
                name='Music'
                className='mx-auto h-10 w-10 text-quaternary-token'
                aria-hidden='true'
              />
              <p className='mt-3 text-sm text-tertiary-token'>
                No streaming links available yet.
              </p>
            </div>
          )}

          {/* Jovie Branding */}
          <footer className='pt-6 text-center'>
            <Link
              href='/'
              className='inline-flex items-center gap-1.5 text-[11px] text-quaternary-token transition-colors hover:text-tertiary-token'
            >
              <span>Powered by</span>
              <span className='font-medium'>Jovie</span>
            </Link>
          </footer>
        </div>
      </main>
    </div>
  );
}
