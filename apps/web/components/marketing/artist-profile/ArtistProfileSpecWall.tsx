import { Download, Music2, RefreshCw, Zap } from 'lucide-react';
import Image from 'next/image';
import type { CSSProperties } from 'react';
import type { ArtistProfileLandingCopy } from '@/data/artistProfileCopy';
import type { MarketingFeatureTile } from '@/data/marketingFeatureTiles';
import { getAccentCssVars } from '@/lib/ui/accent-palette';
import { cn } from '@/lib/utils';
import { ArtistProfileSectionHeader } from './ArtistProfileSectionHeader';
import { ArtistProfileSectionShell } from './ArtistProfileSectionShell';

const SPEC_TILE_ACCENTS: Record<MarketingFeatureTile['accent'], string> = {
  gray: getAccentCssVars('gray').solid,
  blue: getAccentCssVars('blue').solid,
  purple: getAccentCssVars('purple').solid,
  pink: getAccentCssVars('pink').solid,
  red: getAccentCssVars('red').solid,
  orange: getAccentCssVars('orange').solid,
  green: getAccentCssVars('green').solid,
  teal: getAccentCssVars('teal').solid,
};

type AccentStyle = CSSProperties & {
  readonly '--tile-accent': string;
  readonly '--tile-accent-secondary': string;
};

interface ArtistProfileSpecWallProps {
  readonly specWall: ArtistProfileLandingCopy['specWall'];
  readonly tiles: readonly MarketingFeatureTile[];
}

function ScreenshotCrop({
  alt,
  className,
  imageClassName,
  objectPosition,
  src,
}: Readonly<{
  alt: string;
  className?: string;
  imageClassName?: string;
  objectPosition?: string;
  src: string;
}>) {
  return (
    <div
      className={cn(
        'relative overflow-hidden rounded-[1rem] bg-[#0d1015]',
        className
      )}
    >
      <Image
        fill
        alt={alt}
        className={cn('object-cover', imageClassName)}
        sizes='(min-width: 1280px) 28vw, (min-width: 768px) 45vw, 100vw'
        src={src}
        style={{ objectPosition }}
      />
    </div>
  );
}

function ButtonChipVisual({
  chipIcon,
  chipLabel,
}: Readonly<{
  chipIcon?: 'download' | 'sound';
  chipLabel: string;
}>) {
  const Icon = chipIcon === 'download' ? Download : Music2;

  return (
    <div
      role='img'
      aria-label={`${chipLabel} preview`}
      className='flex h-full min-h-[10rem] items-center justify-center rounded-[1rem] bg-[#0b0f14]'
    >
      <div className='inline-flex items-center gap-2 rounded-full bg-white px-4 py-2.5 text-[12px] font-semibold text-black shadow-[0_14px_26px_rgba(0,0,0,0.14)]'>
        <Icon className='h-3.5 w-3.5' strokeWidth={2} />
        {chipLabel}
      </div>
    </div>
  );
}

function IconBadgeVisual({
  badgeIcon,
  badgeLabel,
}: Readonly<{
  badgeIcon: 'speed' | 'sync';
  badgeLabel: string;
}>) {
  const Icon = badgeIcon === 'sync' ? RefreshCw : Zap;

  return (
    <div
      role='img'
      aria-label={`${badgeLabel} preview`}
      className='flex h-full min-h-[10rem] items-center justify-center rounded-[1rem] bg-[#0b0f14]'
    >
      <div className='flex flex-col items-center gap-3 text-center'>
        <span className='inline-flex h-12 w-12 items-center justify-center rounded-full bg-white text-black shadow-[0_16px_28px_rgba(0,0,0,0.14)]'>
          <Icon className='h-5 w-5' strokeWidth={2} />
        </span>
        <p className='text-[12px] font-medium tracking-[-0.01em] text-primary-token'>
          {badgeLabel}
        </p>
      </div>
    </div>
  );
}

const ANALYTICS_FLOATER_STAGES = [
  { label: 'Profile Views', value: '42.8K', width: '100%' },
  { label: 'Unique Visitors', value: '28.2K', width: '66%' },
  { label: 'Followers', value: '6.4K', width: '15%' },
] as const;

function AnalyticsFunnelHeroVisual() {
  return (
    <div
      role='img'
      aria-label='Rich analytics funnel preview'
      className='relative flex h-full min-h-[12.75rem] items-end justify-center overflow-hidden rounded-[1.15rem] pt-2 sm:min-h-[14.5rem] sm:pt-4'
    >
      <div
        aria-hidden='true'
        className='pointer-events-none absolute left-[8%] top-[10%] h-28 w-28 rounded-full opacity-85 blur-3xl sm:h-36 sm:w-36'
        style={{
          background:
            'radial-gradient(circle, color-mix(in srgb, var(--tile-accent) 34%, transparent) 0%, transparent 72%)',
        }}
      />
      <div
        aria-hidden='true'
        className='pointer-events-none absolute bottom-[18%] right-[10%] h-24 w-24 rounded-full opacity-80 blur-3xl sm:h-32 sm:w-32'
        style={{
          background:
            'radial-gradient(circle, color-mix(in srgb, var(--tile-accent-secondary) 34%, transparent) 0%, transparent 74%)',
        }}
      />
      <div className='relative w-full max-w-[30rem] px-1 pb-1 sm:px-3 sm:pb-2'>
        <div className='relative overflow-hidden rounded-[1.4rem] border border-white/[0.08] bg-[linear-gradient(180deg,rgba(17,20,28,0.96),rgba(8,10,16,0.92))] px-4 py-4 shadow-[0_30px_80px_rgba(0,0,0,0.42)] backdrop-blur-[18px] sm:px-5 sm:py-5'>
          <div className='absolute inset-x-0 top-0 h-px bg-white/12' />
          <div
            aria-hidden='true'
            className='pointer-events-none absolute inset-x-10 top-0 h-20 blur-2xl'
            style={{
              background:
                'linear-gradient(90deg, color-mix(in srgb, var(--tile-accent) 20%, transparent), color-mix(in srgb, var(--tile-accent-secondary) 18%, transparent))',
            }}
          />
          <div className='relative space-y-3 sm:space-y-3.5'>
            {ANALYTICS_FLOATER_STAGES.map((stage, index) => (
              <div key={stage.label} className='space-y-1.5 sm:space-y-2'>
                <div className='flex items-center justify-between gap-3'>
                  <div className='flex min-w-0 items-center gap-2'>
                    <span className='truncate text-[11px] font-medium tracking-[-0.01em] text-secondary-token sm:text-[11.5px]'>
                      {stage.label}
                    </span>
                    {index > 0 ? (
                      <span className='inline-flex items-center rounded-full border border-white/6 bg-[color-mix(in_srgb,var(--tile-accent-secondary)_14%,transparent)] px-1.5 py-0.5 text-[9px] font-semibold tabular-nums text-[color:var(--tile-accent-secondary)] sm:text-[10px]'>
                        {stage.width}
                      </span>
                    ) : null}
                  </div>
                  <span className='shrink-0 text-[15px] font-semibold tracking-[-0.03em] text-primary-token sm:text-[17px]'>
                    {stage.value}
                  </span>
                </div>
                <div className='h-2 rounded-full bg-white/[0.06] sm:h-2.5'>
                  <div
                    className='relative h-full rounded-full'
                    style={{
                      width: stage.width,
                      background:
                        'linear-gradient(90deg, color-mix(in srgb, var(--tile-accent) 96%, white 4%), color-mix(in srgb, var(--tile-accent-secondary) 88%, transparent))',
                      boxShadow:
                        '0 0 18px color-mix(in srgb, var(--tile-accent) 22%, transparent)',
                    }}
                  >
                    <span
                      aria-hidden='true'
                      className='absolute inset-y-0 right-0 w-6 rounded-full blur-md'
                      style={{
                        background:
                          'color-mix(in srgb, var(--tile-accent-secondary) 50%, transparent)',
                      }}
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function ArtistProfilePowerFeatureTile({
  tile,
}: Readonly<{
  tile: MarketingFeatureTile;
}>) {
  const style: AccentStyle = {
    '--tile-accent': SPEC_TILE_ACCENTS[tile.accent],
    '--tile-accent-secondary': SPEC_TILE_ACCENTS.purple,
  };

  return (
    <article
      className={cn(
        'relative min-h-[15rem]',
        tile.size === 'large' ? 'md:min-h-[18.5rem]' : 'md:min-h-[14.5rem]',
        tile.layoutClassName
      )}
      style={style}
    >
      <div className='relative flex h-full flex-col overflow-hidden rounded-[1.35rem] bg-[linear-gradient(180deg,rgba(255,255,255,0.035),rgba(255,255,255,0.015)),#07090d] p-4 shadow-[0_22px_64px_rgba(0,0,0,0.28)]'>
        <div
          aria-hidden='true'
          className='pointer-events-none absolute inset-x-0 top-0 h-24 opacity-75'
          style={{
            background:
              'radial-gradient(circle at 20% 0%, color-mix(in srgb, var(--tile-accent) 16%, transparent), transparent 55%)',
          }}
        />
        <div className='relative z-10 max-w-[24rem]'>
          <h3 className='max-w-[18ch] text-[1.08rem] font-semibold tracking-[-0.04em] text-primary-token sm:text-[1.16rem]'>
            {tile.title}
          </h3>
          <p className='mt-3 max-w-[34ch] text-[13px] leading-[1.58] text-secondary-token'>
            {tile.body}
          </p>
        </div>
        <div className='relative z-10 mt-5 flex-1'>
          {tile.visual === 'analytics-funnel-hero' ? (
            <AnalyticsFunnelHeroVisual />
          ) : null}
          {tile.visual === 'button-chip' ? (
            <ButtonChipVisual
              chipIcon={tile.chipIcon}
              chipLabel={tile.chipLabel}
            />
          ) : null}
          {tile.visual === 'icon-badge' ? (
            <IconBadgeVisual
              badgeIcon={tile.badgeIcon}
              badgeLabel={tile.badgeLabel}
            />
          ) : null}
          {tile.visual === 'share-menu-crop' ? (
            <ScreenshotCrop
              alt={tile.screenshotAlt}
              className='h-full min-h-[12rem]'
              imageClassName='object-top'
              objectPosition={tile.objectPosition}
              src={tile.screenshotSrc}
            />
          ) : null}
          {tile.visual === 'cropped-screenshot' ||
          tile.visual === 'screenshot' ? (
            <ScreenshotCrop
              alt={tile.screenshotAlt}
              className='h-full min-h-[12rem]'
              imageClassName={tile.imageClassName}
              objectPosition={tile.objectPosition}
              src={tile.screenshotSrc}
            />
          ) : null}
        </div>
      </div>
    </article>
  );
}

export function ArtistProfileSpecWall({
  specWall,
  tiles,
}: Readonly<ArtistProfileSpecWallProps>) {
  return (
    <ArtistProfileSectionShell
      width='page'
      className='py-24 sm:py-28 lg:py-32'
      containerClassName='max-w-none'
    >
      <div className='mx-auto max-w-[var(--linear-content-max)]'>
        <ArtistProfileSectionHeader
          align='left'
          headline={specWall.headline}
          body={specWall.subhead}
          className='max-w-[44rem]'
          headlineClassName='text-[clamp(2.8rem,4.8vw,4.35rem)]'
          bodyClassName='max-w-[36rem]'
        />

        <div className='mt-8 grid gap-3 md:grid-cols-2 xl:grid-cols-12 xl:grid-rows-4 xl:gap-4'>
          {tiles.map(tile => (
            <ArtistProfilePowerFeatureTile key={tile.id} tile={tile} />
          ))}
        </div>
      </div>
    </ArtistProfileSectionShell>
  );
}
