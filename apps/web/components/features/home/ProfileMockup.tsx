'use client';

import { Music2 } from 'lucide-react';
import Image from 'next/image';
import { useEffect, useState } from 'react';
import { cn } from '@/lib/utils';

const RELEASES = [
  {
    title: 'Signals',
    type: 'Album',
    meta: 'Feb 2022 · 12 tracks',
    tone: 'primary',
  },
  {
    title: 'Where It Goes',
    type: 'Single',
    meta: 'Jun 2020',
    tone: 'secondary',
  },
  {
    title: 'Fading Light',
    type: 'EP',
    meta: 'Nov 2019 · 5 tracks',
    tone: 'tertiary',
  },
] as const;

const CTA_INTERVAL = 5000;

const RELEASE_ART_TONE_CLASS = {
  primary: 'bg-surface-1',
  secondary: 'bg-surface-2',
  tertiary: 'bg-surface-3',
} as const satisfies Record<(typeof RELEASES)[number]['tone'], string>;

/** Fallback values used when no profile data is provided */
const FALLBACK = {
  name: 'Tim White',
  tagline: 'Indie / Alternative · Los Angeles',
  handle: 'tim',
  avatarUrl: null as string | null,
} as const;

export interface ProfileMockupProps {
  /** Display name from the real profile */
  readonly name?: string | null;
  /** Tagline/bio snippet from the real profile */
  readonly tagline?: string | null;
  /** Username handle (shown in the URL bar) */
  readonly handle?: string | null;
  /** Avatar image URL from the real profile */
  readonly avatarUrl?: string | null;
}

export function ProfileMockup({
  name,
  tagline,
  handle,
  avatarUrl,
}: ProfileMockupProps = {}) {
  const displayName = name || FALLBACK.name;
  const displayTagline = tagline || FALLBACK.tagline;
  const displayHandle = handle || FALLBACK.handle;
  const displayAvatar = avatarUrl || FALLBACK.avatarUrl;

  const [isListen, setIsListen] = useState(false);
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false);

  // Check reduced motion preference
  useEffect(() => {
    const mq = globalThis.matchMedia('(prefers-reduced-motion: reduce)');
    setPrefersReducedMotion(mq.matches);
    const handler = (e: MediaQueryListEvent) =>
      setPrefersReducedMotion(e.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);

  useEffect(() => {
    if (prefersReducedMotion) return;
    const id = setInterval(() => {
      setIsListen(prev => !prev);
    }, CTA_INTERVAL);
    return () => clearInterval(id);
  }, [prefersReducedMotion]);

  return (
    <figure
      aria-label='Profile preview showing adaptive CTA behavior'
      className='rounded-t-xl rounded-b-none overflow-hidden bg-surface-0 shadow-panel-ring font-sans'
    >
      <style>{`
        @keyframes ctaFill {
          from { width: 0%; }
          to { width: 100%; }
        }
        .profile-mockup-cta-progress {
          animation: ctaFill 5000ms linear forwards;
        }
        @media (prefers-reduced-motion: reduce) {
          .profile-mockup-cta-progress { animation: none !important; width: 100% !important; }
        }
      `}</style>

      {/* Browser chrome */}
      <div className='flex items-center gap-2 px-3.5 py-2.5 border-b border-subtle'>
        <div className='flex gap-[5px]'>
          <span className='w-2 h-2 rounded-full bg-surface-3' />
          <span className='w-2 h-2 rounded-full bg-surface-3' />
          <span className='w-2 h-2 rounded-full bg-surface-3' />
        </div>
        <div className='flex-1 text-center text-xs text-tertiary-token'>
          jov.ie/{displayHandle}
        </div>
      </div>

      {/* Profile content */}
      <div className='px-5 pt-6 pb-5'>
        {/* Avatar + info */}
        <div className='flex items-center gap-3.5 mb-5'>
          {displayAvatar ? (
            <Image
              src={displayAvatar}
              alt={displayName}
              width={64}
              height={64}
              className='w-16 h-16 rounded-full object-cover shrink-0'
            />
          ) : (
            <div
              className='w-16 h-16 rounded-full flex items-center justify-center border border-subtle bg-surface-1 text-2xl font-semibold text-primary-token shrink-0'
              aria-hidden='true'
            >
              {displayName.charAt(0).toUpperCase()}
            </div>
          )}
          <div>
            <div className='text-base font-semibold text-primary-token mb-0.5'>
              {displayName}
            </div>
            <div className='text-app text-tertiary-token'>
              {displayTagline}
            </div>
          </div>
        </div>

        {/* Releases */}
        <div className='flex flex-col gap-2.5 mb-5'>
          {RELEASES.map(release => (
            <div key={release.title} className='flex items-center gap-3'>
              <div
                className={cn(
                  'w-10 h-10 rounded-md shrink-0 border border-subtle',
                  RELEASE_ART_TONE_CLASS[release.tone]
                )}
                aria-hidden='true'
              />
              <div className='min-w-0'>
                <div className='text-app font-medium text-primary-token truncate'>
                  {release.title}
                </div>
                <div className='text-xs text-tertiary-token'>
                  {release.type} · {release.meta}
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* CTA area */}
        <div className='relative h-10 overflow-hidden rounded-lg'>
          {/* Subscribe CTA */}
          <div
            aria-hidden={isListen}
            className={cn(
              'absolute inset-0 flex items-center justify-center rounded-lg bg-btn-primary px-3.5 text-center text-app font-medium text-btn-primary-foreground transition-opacity duration-cinematic',
              isListen ? 'pointer-events-none opacity-0' : 'opacity-100'
            )}
          >
            Get updates from {displayName}
          </div>

          {/* Listen CTA */}
          <div
            aria-hidden={!isListen}
            className={cn(
              'absolute inset-0 flex items-center justify-center gap-2 rounded-lg border border-subtle bg-surface-1 px-3.5 text-center text-app font-medium text-primary-token transition-opacity duration-cinematic',
              isListen ? 'opacity-100' : 'pointer-events-none opacity-0'
            )}
          >
            <Music2 className='h-3.5 w-3.5 shrink-0' aria-hidden='true' />
            <span>Play Signals on Spotify</span>
          </div>

          {/* Progress bar */}
          <progress
            key={isListen ? 'listen' : 'subscribe'}
            value={0}
            max={100}
            aria-label='Time until CTA switches'
            className={cn(
              'profile-mockup-cta-progress absolute bottom-0 left-0 h-[3px] opacity-60 appearance-none [&::-moz-progress-bar]:bg-current [&::-webkit-progress-bar]:bg-transparent [&::-webkit-progress-value]:bg-current',
              isListen ? 'text-primary-token' : 'text-tertiary-token',
              prefersReducedMotion && 'w-full'
            )}
          />
        </div>

        {/* Label */}
        <div className='mt-2 text-center text-2xs text-tertiary-token transition-opacity duration-cinematic'>
          {isListen
            ? 'Return visitor · preferred streaming platform'
            : 'New visitor · email / sms notification opt-in'}
        </div>
      </div>
    </figure>
  );
}
