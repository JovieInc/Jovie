import Image from 'next/image';
import { SmartLinkProviderButton } from '@/features/release/SmartLinkProviderButton';
import type { Release } from './releases-data';
import { DSP_LABELS, getDspConfig, SMART_LINK_DSPS } from './releases-data';

/* ------------------------------------------------------------------ */
/*  Release phone content — the inner part of a smart link phone page  */
/*  Shared between hero (crossfade wrapper) and releases section       */
/* ------------------------------------------------------------------ */

export function ReleasePhoneContent({
  release,
}: {
  readonly release: Release;
}) {
  return (
    <>
      {/* URL bar */}
      <div
        className='mx-4 mt-10 mb-1 flex items-center justify-center rounded-full bg-surface-1 px-3 py-1.5'
        style={{ border: '1px solid var(--linear-border-subtle)' }}
      >
        <span className='truncate text-[10px] text-tertiary-token'>
          jov.ie/{release.slug}
        </span>
      </div>

      {/* Artwork */}
      <div className='px-6 py-4'>
        <div
          className='relative aspect-square w-full overflow-hidden rounded-2xl bg-surface-2'
          style={{
            boxShadow: '0 8px 32px rgba(0,0,0,0.5), 0 2px 8px rgba(0,0,0,0.3)',
          }}
        >
          <Image
            src={release.artwork}
            alt={release.title}
            fill
            className='object-cover'
            sizes='220px'
          />
        </div>
      </div>

      {/* Title */}
      <div className='px-6 pb-4 text-center'>
        <p className='text-[15px] font-semibold tracking-tight text-primary-token'>
          {release.title}
        </p>
        <p className='mt-0.5 text-xs text-tertiary-token'>Tim White</p>
      </div>

      {/* DSP buttons */}
      <div className='flex flex-col gap-2 px-5'>
        {SMART_LINK_DSPS.map(key => {
          const config = getDspConfig(key);
          if (!config) return null;
          return (
            <SmartLinkProviderButton
              key={key}
              label={DSP_LABELS[key] ?? 'Spotify'}
              iconPath={config.iconPath}
              className='bg-surface-1 ring-[color:var(--linear-border-subtle)] hover:bg-hover'
            />
          );
        })}
      </div>
    </>
  );
}
