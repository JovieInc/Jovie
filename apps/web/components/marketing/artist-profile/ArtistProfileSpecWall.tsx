import Image from 'next/image';
import type { CSSProperties, ReactNode } from 'react';
import type { ArtistProfileLandingCopy } from '@/data/artistProfileCopy';
import type { ArtistProfileFeatureTile } from '@/data/artistProfileFeatures';
import { cn } from '@/lib/utils';
import { ArtistProfileSectionShell } from './ArtistProfileSectionShell';

const SPEC_TILE_ACCENTS: Record<ArtistProfileFeatureTile['accent'], string> = {
  blue: 'rgba(101, 176, 255, 0.8)',
  teal: 'rgba(77, 209, 191, 0.76)',
  green: 'rgba(114, 222, 144, 0.76)',
  orange: 'rgba(244, 162, 89, 0.78)',
  rose: 'rgba(255, 124, 158, 0.74)',
  gray: 'rgba(196, 206, 218, 0.52)',
};

const SPEC_TILE_LAYOUT: Record<ArtistProfileFeatureTile['id'], string> = {
  'audience-quality-filtering':
    'xl:col-start-1 xl:row-start-1 xl:col-span-5 xl:row-span-2',
  'own-your-fan-list':
    'xl:col-start-6 xl:row-start-1 xl:col-span-4 xl:row-span-2',
  'activate-creators':
    'xl:col-start-4 xl:row-start-3 xl:col-span-4 xl:row-span-2',
  'geo-insights': 'xl:col-start-8 xl:row-start-3 xl:col-span-5 xl:row-span-2',
  'always-in-sync':
    'xl:col-start-10 xl:row-start-1 xl:col-span-3 xl:row-span-1',
  'retarget-warm-fans':
    'xl:col-start-10 xl:row-start-2 xl:col-span-3 xl:row-span-1',
  'press-ready-assets':
    'xl:col-start-1 xl:row-start-3 xl:col-span-3 xl:row-span-1',
  'utm-builder': 'xl:col-start-1 xl:row-start-4 xl:col-span-3 xl:row-span-1',
};

type AccentStyle = CSSProperties & {
  readonly '--tile-accent': string;
};

interface ArtistProfileSpecWallProps {
  readonly specWall: ArtistProfileLandingCopy['specWall'];
  readonly opinionated: ArtistProfileLandingCopy['opinionated'];
  readonly tiles: readonly ArtistProfileFeatureTile[];
}

function ProofChip({
  children,
  className,
}: Readonly<{ children: ReactNode; className?: string }>) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full border border-white/10 bg-black/45 px-3 py-1 text-[11px] font-medium tracking-[-0.02em] text-primary-token backdrop-blur-md',
        className
      )}
    >
      {children}
    </span>
  );
}

function ProofMetaPill({
  label,
}: Readonly<{
  label: string;
}>) {
  return (
    <span className='rounded-full border border-white/8 bg-white/[0.045] px-2.5 py-1 text-[11px] font-medium tracking-[-0.02em] text-secondary-token'>
      {label}
    </span>
  );
}

function ScreenshotCrop({
  alt,
  className,
  objectPosition,
  src,
}: Readonly<{
  alt: string;
  className?: string;
  objectPosition?: string;
  src: string;
}>) {
  return (
    <div
      className={cn(
        'relative overflow-hidden rounded-[1.15rem] border border-white/10 bg-[#0d1015]',
        className
      )}
    >
      <Image
        fill
        alt={alt}
        className='object-cover'
        sizes='(min-width: 1280px) 30vw, (min-width: 768px) 45vw, 100vw'
        src={src}
        style={{ objectPosition }}
      />
      <div className='absolute inset-0 bg-[linear-gradient(180deg,rgba(2,4,8,0.08),rgba(2,4,8,0.58))]' />
    </div>
  );
}

function renderPowerFeatureProof(tile: ArtistProfileFeatureTile) {
  switch (tile.id) {
    case 'audience-quality-filtering':
      return (
        <div className='relative h-full overflow-hidden rounded-[1.3rem] border border-white/8 bg-[#090c12] p-3'>
          <div className='relative z-10 flex flex-wrap gap-2'>
            {tile.proofMeta.map(item => (
              <ProofChip key={item}>{item}</ProofChip>
            ))}
          </div>
          <div className='absolute inset-x-3 bottom-3 top-16'>
            <ScreenshotCrop
              alt={tile.screenshotAlt ?? tile.title}
              className='absolute inset-0'
              objectPosition={tile.objectPosition}
              src={tile.screenshotSrc ?? ''}
            />
            <div className='absolute left-4 top-6 w-[12.5rem] rounded-[1rem] border border-white/10 bg-black/58 p-3 backdrop-blur-md'>
              <p className='text-[11px] font-medium text-secondary-token'>
                Real audience view
              </p>
              <div className='mt-3 space-y-2'>
                <div className='flex items-center justify-between rounded-[0.9rem] bg-white/[0.06] px-3 py-2'>
                  <span className='text-[12px] font-medium text-primary-token'>
                    Repeat listener
                  </span>
                  <span className='text-[11px] text-secondary-token'>High</span>
                </div>
                <div
                  className='flex items-center justify-between rounded-[0.9rem] px-3 py-2'
                  style={{
                    backgroundColor:
                      'color-mix(in srgb, var(--tile-accent) 14%, transparent)',
                  }}
                >
                  <span className='text-[12px] font-medium text-primary-token'>
                    Touring city lead
                  </span>
                  <span className='text-[11px] text-primary-token'>Clean</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      );
    case 'own-your-fan-list':
      return (
        <div className='relative h-full overflow-hidden rounded-[1.3rem] border border-white/8 bg-[#090c12] p-3'>
          <div className='absolute inset-x-3 top-3 flex items-center justify-between'>
            <ProofChip>Audience CRM</ProofChip>
            <ProofChip className='text-[color:var(--tile-accent)]'>
              Export CSV
            </ProofChip>
          </div>
          <div className='absolute inset-x-3 bottom-16 top-14'>
            <ScreenshotCrop
              alt={tile.screenshotAlt ?? tile.title}
              className='h-full'
              objectPosition={tile.objectPosition}
              src={tile.screenshotSrc ?? ''}
            />
          </div>
          <div className='absolute inset-x-3 bottom-3 grid grid-cols-3 gap-2'>
            {tile.proofMeta.map(item => (
              <div
                key={item}
                className='rounded-[0.95rem] border border-white/8 bg-black/52 px-3 py-2 text-center text-[11px] font-medium text-secondary-token backdrop-blur-md'
              >
                {item}
              </div>
            ))}
          </div>
        </div>
      );
    case 'activate-creators':
      return (
        <div className='relative h-full overflow-hidden rounded-[1.3rem] border border-white/8 bg-[#090c12] p-3'>
          <div className='absolute inset-3'>
            <ScreenshotCrop
              alt={tile.screenshotAlt ?? tile.title}
              className='h-full'
              objectPosition={tile.objectPosition}
              src={tile.screenshotSrc ?? ''}
            />
          </div>
          <div className='absolute left-5 top-5 flex max-w-[10rem] flex-wrap gap-2'>
            {tile.proofMeta.map(item => (
              <ProofChip key={item}>{item}</ProofChip>
            ))}
          </div>
          <div className='absolute bottom-5 left-5 flex items-center gap-3 rounded-full border border-white/10 bg-black/56 px-3 py-2 backdrop-blur-md'>
            <div className='flex -space-x-2'>
              {['AN', 'KM', 'SR'].map(initials => (
                <span
                  key={initials}
                  className='flex h-8 w-8 items-center justify-center rounded-full border border-white/10 bg-white/10 text-[10px] font-semibold text-primary-token'
                >
                  {initials}
                </span>
              ))}
            </div>
            <div>
              <p className='text-[11px] font-medium text-primary-token'>
                Creator momentum
              </p>
              <p className='text-[11px] text-secondary-token'>
                Ready to spread this release
              </p>
            </div>
          </div>
        </div>
      );
    case 'geo-insights':
      return (
        <div className='relative h-full overflow-hidden rounded-[1.3rem] border border-white/8 bg-[#090c12] p-3'>
          <ScreenshotCrop
            alt={tile.screenshotAlt ?? tile.title}
            className='h-full'
            objectPosition={tile.objectPosition}
            src={tile.screenshotSrc ?? ''}
          />
        </div>
      );
    case 'always-in-sync':
      return (
        <div className='relative h-full overflow-hidden rounded-[1.3rem] border border-white/8 bg-[#090c12] p-3'>
          <div className='flex items-center justify-between gap-3 rounded-[0.95rem] border border-white/8 bg-white/[0.035] px-3 py-2'>
            <div className='flex items-center gap-2 text-[11px] font-medium text-secondary-token'>
              <span className='h-2 w-2 rounded-full bg-[color:var(--tile-accent)] shadow-[0_0_20px_var(--tile-accent)]' />
              Updated across profile surfaces
            </div>
            <span className='text-[11px] font-semibold text-[color:var(--tile-accent)]'>
              Static and always current
            </span>
          </div>
          <div className='mt-4 h-[11rem]'>
            <ScreenshotCrop
              alt={tile.screenshotAlt ?? tile.title}
              className='h-full'
              objectPosition={tile.objectPosition}
              src={tile.screenshotSrc ?? ''}
            />
          </div>
        </div>
      );
    case 'retarget-warm-fans':
      return (
        <div className='relative h-full overflow-hidden rounded-[1.3rem] border border-white/8 bg-[#090c12] p-3'>
          <ScreenshotCrop
            alt={tile.screenshotAlt ?? tile.title}
            className='h-full'
            objectPosition={tile.objectPosition}
            src={tile.screenshotSrc ?? ''}
          />
        </div>
      );
    case 'press-ready-assets':
      return (
        <div className='relative h-full overflow-hidden rounded-[1.3rem] border border-white/8 bg-[#090c12] p-3'>
          <ScreenshotCrop
            alt={tile.screenshotAlt ?? tile.title}
            className='h-full'
            objectPosition={tile.objectPosition}
            src={tile.screenshotSrc ?? ''}
          />
        </div>
      );
    case 'utm-builder':
      return (
        <div className='relative h-full overflow-hidden rounded-[1.3rem] border border-white/8 bg-[#090c12] p-3'>
          <ScreenshotCrop
            alt={tile.screenshotAlt ?? tile.title}
            className='h-full'
            objectPosition={tile.objectPosition}
            src={tile.screenshotSrc ?? ''}
          />
        </div>
      );
    default: {
      const exhaustiveCheck: never = tile.id;
      return exhaustiveCheck;
    }
  }
}

function ArtistProfilePowerFeatureTile({
  tile,
}: Readonly<{
  tile: ArtistProfileFeatureTile;
}>) {
  const style: AccentStyle = {
    '--tile-accent': SPEC_TILE_ACCENTS[tile.accent],
  };

  return (
    <article
      className={cn(
        'relative min-h-[15.5rem]',
        tile.size === 'large' ? 'md:min-h-[20rem]' : 'md:min-h-[16rem]',
        SPEC_TILE_LAYOUT[tile.id]
      )}
      style={style}
    >
      <div className='relative flex h-full flex-col overflow-hidden rounded-[1.65rem] border border-white/8 bg-[linear-gradient(180deg,rgba(255,255,255,0.04),rgba(255,255,255,0.015)),#07090d] p-4 shadow-[0_26px_80px_rgba(0,0,0,0.35)] sm:p-5'>
        <div
          aria-hidden='true'
          className='pointer-events-none absolute inset-x-0 top-0 h-28 opacity-80'
          style={{
            background:
              'radial-gradient(circle at 20% 0%, color-mix(in srgb, var(--tile-accent) 18%, transparent), transparent 55%)',
          }}
        />
        <div className='relative z-10'>
          <p className='text-[11px] font-medium tracking-[-0.02em] text-[color:var(--tile-accent)]'>
            {tile.kicker}
          </p>
          <h3 className='mt-3 max-w-[18ch] text-[1.08rem] font-semibold tracking-[-0.04em] text-primary-token sm:text-[1.18rem]'>
            {tile.title}
          </h3>
          <p className='mt-3 max-w-[33ch] text-[13px] leading-[1.6] text-secondary-token sm:text-[13.5px]'>
            {tile.body}
          </p>
        </div>
        <div className='relative z-10 mt-5 flex-1'>
          {renderPowerFeatureProof(tile)}
        </div>
        {tile.id === 'audience-quality-filtering' ||
        tile.id === 'activate-creators' ? null : (
          <div className='relative z-10 mt-4 flex flex-wrap gap-2'>
            {tile.proofMeta.map(item => (
              <ProofMetaPill key={item} label={item} />
            ))}
          </div>
        )}
      </div>
    </article>
  );
}

export function ArtistProfileSpecWall({
  specWall,
  opinionated,
  tiles,
}: Readonly<ArtistProfileSpecWallProps>) {
  return (
    <ArtistProfileSectionShell
      width='landing'
      className='py-20 sm:py-24 lg:py-28'
      containerClassName='lg:max-w-none'
    >
      <div className='mx-auto max-w-[1260px] px-5 sm:px-8 lg:px-10'>
        <div className='grid gap-8 border-y border-white/8 py-8 lg:grid-cols-[minmax(0,0.94fr)_minmax(20rem,0.74fr)] lg:items-start lg:gap-12 lg:py-10'>
          <div className='max-w-[42rem]'>
            <p className='text-[13px] font-medium tracking-[-0.02em] text-tertiary-token'>
              {specWall.eyebrow}
            </p>
            <h2 className='marketing-h2-linear mt-4 max-w-[11ch] text-primary-token lg:!text-[clamp(3rem,5.1vw,4.7rem)] lg:!leading-[0.93] lg:!tracking-[-0.06em]'>
              {specWall.headline}
            </h2>
            <p className='mt-5 max-w-[34rem] text-[15px] leading-[1.7] text-secondary-token'>
              {specWall.subhead}
            </p>
          </div>

          <div className='lg:border-l lg:border-white/8 lg:pl-8'>
            <p className='text-[12px] font-medium tracking-[-0.02em] text-tertiary-token'>
              {opinionated.eyebrow}
            </p>
            <p className='mt-3 max-w-[29rem] text-[14px] leading-[1.65] text-secondary-token'>
              {opinionated.body}
            </p>
            <div className='mt-6 divide-y divide-white/8 rounded-[1.35rem] border border-white/8 bg-white/[0.02]'>
              {opinionated.rules.map(rule => (
                <div
                  key={rule.id}
                  className='grid items-center gap-2 px-4 py-3 sm:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] sm:px-5'
                >
                  <span className='text-[12px] font-medium tracking-[-0.02em] text-secondary-token'>
                    {rule.context}
                  </span>
                  <span className='hidden text-white/24 sm:block'>→</span>
                  <span className='text-[12px] font-semibold tracking-[-0.02em] text-primary-token sm:text-right'>
                    {rule.result}
                  </span>
                </div>
              ))}
            </div>
            <div className='mt-4 flex flex-wrap gap-2'>
              {opinionated.principles.map(principle => (
                <span
                  key={principle}
                  className='inline-flex items-center rounded-full border border-white/8 px-3 py-1 text-[11px] font-medium tracking-[-0.02em] text-secondary-token'
                >
                  {principle}
                </span>
              ))}
            </div>
          </div>
        </div>

        <div className='mt-8 grid gap-3 md:grid-cols-2 xl:grid-cols-12 xl:grid-rows-4 xl:gap-4'>
          {tiles.map(tile => (
            <ArtistProfilePowerFeatureTile key={tile.id} tile={tile} />
          ))}
        </div>
      </div>
    </ArtistProfileSectionShell>
  );
}
