/**
 * Shared phone mode content for the marketing homepage.
 *
 * Used by both HeroProfilePreview (hero auto-advancing phone) and
 * DeeplinksGrid (scroll-driven phone) to avoid code duplication.
 */

import { SocialIcon } from '@/components/atoms/SocialIcon';

/* ------------------------------------------------------------------ */
/*  Constants                                                          */
/* ------------------------------------------------------------------ */

export const MOCK_ARTIST = {
  name: 'Tim White',
  handle: 'timwhite',
  image:
    'https://egojgbuon2z2yahy.public.blob.vercel-storage.com/avatars/users/user_38SPgR24re2YSaXT2hVoFtvvlVy/tim-white-profie-pic-e2f4672b-3555-4a63-9fe6-f0d5362218f6.avif',
  isVerified: true,
} as const;

export const PHONE_CTA_CLASS =
  'inline-flex w-full items-center justify-center gap-2.5 rounded-xl px-8 py-3 text-[13px] font-semibold shadow-sm bg-[var(--linear-bg-surface-2)] text-[var(--linear-text-primary)] border border-[var(--linear-border-subtle)]';

export const PHONE_CONTENT_HEIGHT = 196;

/* ------------------------------------------------------------------ */
/*  Mode content panels                                                */
/* ------------------------------------------------------------------ */

export const MOCK_TOUR_DATES = [
  { city: 'Atlanta, GA', venue: 'The Masquerade', date: 'Mar 22' },
  { city: 'Nashville, TN', venue: 'Exit/In', date: 'Mar 28' },
  { city: 'Austin, TX', venue: 'Mohawk', date: 'Apr 4' },
] as const;

function ListenContent() {
  const dsps = [
    { platform: 'spotify', label: 'Spotify' },
    { platform: 'applemusic', label: 'Apple Music' },
    { platform: 'youtube', label: 'YouTube' },
  ] as const;
  return (
    <div className='flex h-full flex-col justify-center gap-2'>
      {dsps.map(dsp => (
        <button key={dsp.platform} type='button' className={PHONE_CTA_CLASS}>
          <SocialIcon platform={dsp.platform} size={16} aria-hidden />
          {dsp.label}
        </button>
      ))}
    </div>
  );
}

function TipContent() {
  return (
    <div className='flex h-full flex-col justify-center gap-3'>
      <p className='text-[10px] font-medium uppercase tracking-[0.15em] text-[var(--linear-text-tertiary)]'>
        Choose amount
      </p>
      <div className='grid grid-cols-3 gap-2'>
        {([3, 5, 10] as const).map((amount, i) => (
          <div
            key={amount}
            className={`flex aspect-square flex-col items-center justify-center gap-0.5 rounded-xl border text-center ${
              i === 1
                ? 'border-[var(--linear-border-default)] bg-[var(--linear-bg-surface-2)] text-[var(--linear-text-primary)] shadow-sm'
                : 'border-[var(--linear-border-subtle)] bg-[var(--linear-bg-surface-1)] text-[var(--linear-text-primary)]'
            }`}
          >
            <span
              className={`text-[10px] font-medium uppercase tracking-wider ${
                i === 1
                  ? 'text-[var(--linear-text-secondary)]'
                  : 'text-[var(--linear-text-tertiary)]'
              }`}
            >
              USD
            </span>
            <span className='text-xl font-semibold tabular-nums tracking-tight'>
              ${amount}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function TourContent() {
  return (
    <div className='flex h-full flex-col justify-center gap-2'>
      {MOCK_TOUR_DATES.map(show => (
        <div
          key={show.city}
          className='flex w-full items-center justify-between rounded-xl px-4 py-3 bg-[var(--linear-bg-surface-1)] border border-[var(--linear-border-subtle)]'
        >
          <div className='min-w-0'>
            <p className='text-[13px] font-medium text-[var(--linear-text-primary)] truncate'>
              {show.venue}
            </p>
            <p className='text-[11px] text-[var(--linear-text-tertiary)]'>
              {show.city}
            </p>
          </div>
          <span className='shrink-0 text-[11px] font-medium text-[var(--linear-text-secondary)]'>
            {show.date}
          </span>
        </div>
      ))}
    </div>
  );
}

function ProfileContent() {
  const platforms = ['instagram', 'spotify', 'youtube', 'tiktok'] as const;
  return (
    <div className='flex h-full flex-col justify-center gap-4'>
      <button type='button' className={PHONE_CTA_CLASS}>
        Turn on notifications
      </button>
      <div className='flex items-center justify-center gap-1.5'>
        {platforms.map(p => (
          <span
            key={p}
            className='inline-flex h-10 w-10 items-center justify-center rounded-full text-[var(--linear-text-tertiary)]'
          >
            <SocialIcon platform={p} size={18} aria-hidden />
          </span>
        ))}
      </div>
    </div>
  );
}

/** Pre-built mode content keyed by mode ID. */
export const MODE_CONTENT: Record<string, React.ReactNode> = {
  listen: <ListenContent />,
  tip: <TipContent />,
  tour: <TourContent />,
  profile: <ProfileContent />,
};

/** Mode IDs in display order. */
export const MODE_IDS = ['profile', 'tour', 'tip', 'listen'] as const;
