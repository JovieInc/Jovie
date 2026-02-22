import type { FeaturedCreator } from '@/lib/featured-creators';

interface MobileProfilePreviewProps {
  readonly creator: FeaturedCreator;
}

/**
 * Minimal profile preview matching the live Jovie public profile (e.g. jov.ie/tim).
 * Centered photo, name + verified badge, subtitle, social icons, single CTA.
 */
export function MobileProfilePreview({ creator }: MobileProfilePreviewProps) {
  const displayName = creator.name.trim() || creator.handle;
  const primaryGenre = creator.genres[0] ?? 'Artist';

  return (
    <div
      className='flex h-full flex-col items-center'
      style={{ backgroundColor: 'rgb(8, 9, 10)' }}
    >
      {/* Profile photo */}
      <div className='pt-12 pb-3'>
        <div
          className='overflow-hidden rounded-full p-[2px]'
          style={{
            boxShadow: '0 0 0 1px rgba(255,255,255,0.06)',
          }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={creator.src}
            alt={displayName}
            className='h-16 w-16 rounded-full object-cover'
            loading='eager'
          />
        </div>
      </div>

      {/* Name + verified badge */}
      <div className='flex items-center gap-1'>
        <p
          className='text-[15px] font-semibold'
          style={{ color: 'rgb(247, 248, 248)' }}
        >
          {displayName}
        </p>
        <span className='inline-flex rounded-full bg-white/10 p-0.5 text-sky-400'>
          <svg
            aria-hidden='true'
            width='14'
            height='14'
            viewBox='0 0 24 24'
            fill='currentColor'
            stroke='rgb(8, 9, 10)'
            strokeWidth='2'
          >
            <path
              d='M9 12l2 2 4-4'
              stroke='rgb(8, 9, 10)'
              fill='none'
              strokeWidth='2.5'
              strokeLinecap='round'
              strokeLinejoin='round'
            />
            <path d='M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10 10-4.5 10-10S17.5 2 12 2z' />
          </svg>
        </span>
      </div>

      {/* Subtitle */}
      <p
        className='mt-1 text-[11px] font-normal uppercase tracking-[0.2em]'
        style={{ color: 'rgba(255, 255, 255, 0.4)' }}
      >
        {primaryGenre}
      </p>

      {/* Social icons — just icons, no labels */}
      <div className='mt-4 flex items-center gap-3'>
        <SocialIcon icon='ig' label='Instagram' />
        <SocialIcon icon='tt' label='TikTok' />
        <SocialIcon icon='tip' label='Tip' />
      </div>

      {/* Big CTA — matches TwoStepNotificationsCTA */}
      <div className='mt-auto w-full px-5 pb-6'>
        <div
          className='flex w-full items-center justify-center gap-2.5 rounded-xl py-4 text-[15px] font-semibold'
          style={{
            backgroundColor: 'rgb(247, 248, 248)',
            color: 'rgb(8, 9, 10)',
          }}
        >
          <svg
            aria-hidden='true'
            width='18'
            height='18'
            viewBox='0 0 24 24'
            fill='none'
            stroke='currentColor'
            strokeWidth='2'
            strokeLinecap='round'
            strokeLinejoin='round'
          >
            <path d='M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9' />
            <path d='M10.3 21a1.94 1.94 0 0 0 3.4 0' />
          </svg>
          Turn on Notifications
        </div>
      </div>
    </div>
  );
}

function SocialIcon({
  icon,
  label,
}: {
  readonly icon: 'ig' | 'tt' | 'tip';
  readonly label: string;
}) {
  const icons = {
    ig: (
      <svg
        aria-hidden='true'
        width='18'
        height='18'
        viewBox='0 0 24 24'
        fill='none'
        stroke='currentColor'
        strokeWidth='1.5'
        strokeLinecap='round'
        strokeLinejoin='round'
      >
        <rect x='2' y='2' width='20' height='20' rx='5' />
        <circle cx='12' cy='12' r='5' />
        <circle cx='17.5' cy='6.5' r='1' fill='currentColor' stroke='none' />
      </svg>
    ),
    tt: (
      <svg
        aria-hidden='true'
        width='18'
        height='18'
        viewBox='0 0 24 24'
        fill='currentColor'
      >
        <path d='M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-2.88 2.5 2.89 2.89 0 0 1 0-5.78c.27 0 .54.04.79.1v-3.5a6.37 6.37 0 0 0-.79-.05A6.34 6.34 0 0 0 3.15 15.3 6.34 6.34 0 0 0 9.49 21.6a6.34 6.34 0 0 0 6.34-6.34V8.7a8.16 8.16 0 0 0 3.76.92V6.69Z' />
      </svg>
    ),
    tip: (
      <svg
        aria-hidden='true'
        width='18'
        height='18'
        viewBox='0 0 24 24'
        fill='none'
        stroke='currentColor'
        strokeWidth='1.5'
        strokeLinecap='round'
        strokeLinejoin='round'
      >
        <path d='M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z' />
      </svg>
    ),
  };

  return (
    <button
      type='button'
      className='flex h-9 w-9 items-center justify-center rounded-full'
      style={{
        backgroundColor: 'rgba(255, 255, 255, 0.05)',
        color: 'rgba(255, 255, 255, 0.5)',
      }}
      title={label}
      tabIndex={-1}
    >
      {icons[icon]}
    </button>
  );
}
