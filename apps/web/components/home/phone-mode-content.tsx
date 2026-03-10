/**
 * Shared phone mode content for the marketing homepage.
 *
 * Used by both HeroProfilePreview (hero auto-advancing phone) and
 * DeeplinksGrid (scroll-driven phone) to avoid code duplication.
 */

import { DSP_LOGO_CONFIG } from '@/components/atoms/DspLogo';
import { SocialIcon } from '@/components/atoms/SocialIcon';
import { SmartLinkProviderButton } from '@/components/release/SmartLinkProviderButton';

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
  'inline-flex w-full items-center justify-center gap-2.5 rounded-[14px] border px-8 py-3 text-[13px] font-semibold text-[color:var(--linear-text-primary)] shadow-[0_12px_28px_rgba(0,0,0,0.18)]';

export const PHONE_CONTENT_HEIGHT = 196;

/* ------------------------------------------------------------------ */
/*  Mode content panels                                                */
/* ------------------------------------------------------------------ */

export const MOCK_TOUR_DATES = [
  { city: 'Los Angeles, CA', venue: 'Academy LA', date: 'Apr 12' },
] as const;

function ListenContent() {
  const dsps = [
    { key: 'spotify', label: 'Spotify' },
    { key: 'apple_music', label: 'Apple Music' },
    { key: 'youtube', label: 'YouTube' },
  ] as const;
  return (
    <div className='flex h-full flex-col justify-center gap-2'>
      {dsps.map(dsp => (
        <SmartLinkProviderButton
          key={dsp.key}
          label={dsp.label}
          iconPath={DSP_LOGO_CONFIG[dsp.key]?.iconPath}
          className='px-3 py-2.5 text-[13px] bg-[var(--linear-bg-surface-2)] border border-[var(--linear-border-subtle)] ring-0 backdrop-blur-none hover:bg-[var(--linear-bg-hover)]'
        />
      ))}
    </div>
  );
}

function TipContent() {
  return (
    <div className='flex h-full flex-col justify-center gap-3'>
      <p className='text-[10px] font-medium uppercase tracking-[0.15em] text-[color:var(--linear-text-tertiary)]'>
        Choose amount
      </p>
      <div className='grid grid-cols-3 gap-2'>
        {([3, 5, 10] as const).map((amount, i) => (
          <div
            key={amount}
            className={`flex aspect-square flex-col items-center justify-center gap-0.5 rounded-xl border text-center ${
              i === 1
                ? 'border-[var(--linear-border-default)] bg-[var(--linear-bg-surface-2)] text-[color:var(--linear-text-primary)] shadow-sm'
                : 'border-[var(--linear-border-subtle)] bg-[var(--linear-bg-surface-1)] text-[color:var(--linear-text-primary)]'
            }`}
          >
            <span
              className={`text-[10px] font-medium uppercase tracking-wider ${
                i === 1
                  ? 'text-[color:var(--linear-text-secondary)]'
                  : 'text-[color:var(--linear-text-tertiary)]'
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
  const show = MOCK_TOUR_DATES[0];
  return (
    <div className='flex h-full flex-col justify-center gap-3'>
      <div className='flex w-full items-center justify-between rounded-xl px-4 py-3.5 bg-[var(--linear-bg-surface-1)] border border-[var(--linear-border-subtle)]'>
        <div className='min-w-0'>
          <p className='text-[13px] font-medium text-[color:var(--linear-text-primary)] truncate'>
            {show.venue}
          </p>
          <p className='text-[11px] text-[color:var(--linear-text-tertiary)]'>
            {show.city}
          </p>
        </div>
        <span className='shrink-0 text-[11px] font-medium text-[color:var(--linear-text-secondary)]'>
          {show.date}
        </span>
      </div>
      <button
        type='button'
        className='text-[12px] font-medium text-[color:var(--linear-text-tertiary)] hover:text-[color:var(--linear-text-secondary)] transition-colors'
      >
        See more dates
      </button>
    </div>
  );
}

function ProfileContent() {
  const platforms = ['instagram', 'spotify', 'youtube', 'tiktok'] as const;
  return (
    <div className='flex h-full flex-col justify-center gap-4'>
      <button
        type='button'
        className={PHONE_CTA_CLASS}
        style={{
          background:
            'linear-gradient(180deg, rgba(255,255,255,0.09) 0%, rgba(255,255,255,0.05) 100%)',
          borderColor: 'rgba(255,255,255,0.08)',
        }}
      >
        Turn on notifications
      </button>
      <div
        className='flex items-center justify-center gap-1.5 rounded-full px-2 py-1.5'
        style={{
          backgroundColor: 'rgba(255,255,255,0.025)',
          border: '1px solid rgba(255,255,255,0.05)',
        }}
      >
        {platforms.map(p => (
          <span
            key={p}
            className='inline-flex h-10 w-10 items-center justify-center rounded-full text-[color:var(--linear-text-tertiary)]'
            style={{ backgroundColor: 'rgba(255,255,255,0.015)' }}
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
