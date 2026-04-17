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

function MockPopoverVisual({
  popoverItems,
  popoverLabel,
}: Readonly<{
  popoverItems: readonly string[];
  popoverLabel: string;
}>) {
  return (
    <div
      role='img'
      aria-label={`${popoverLabel} preview`}
      className='flex h-full min-h-[10rem] items-center justify-center rounded-[1rem] bg-[#0b0f14] p-4'
    >
      <div className='w-full max-w-[15rem] rounded-[1rem] bg-[#121722] p-3 shadow-[0_18px_40px_rgba(0,0,0,0.22)]'>
        <div className='inline-flex rounded-full bg-white px-3 py-1.5 text-[11px] font-semibold text-black'>
          {popoverLabel}
        </div>
        <div className='mt-3 space-y-2 rounded-[0.9rem] bg-[#0c1018] p-2.5'>
          {popoverItems.map(item => (
            <div
              key={item}
              className='rounded-[0.7rem] border border-white/6 bg-white/[0.03] px-3 py-2 text-[11px] font-medium text-primary-token'
            >
              {item}
            </div>
          ))}
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
      <div className='relative flex h-full flex-col overflow-hidden rounded-[1.35rem] bg-[linear-gradient(180deg,rgba(255,255,255,0.03),rgba(255,255,255,0.012)),#07090d] p-4 shadow-[0_22px_64px_rgba(0,0,0,0.28)]'>
        <div
          aria-hidden='true'
          className='pointer-events-none absolute inset-x-0 top-0 h-24 opacity-75'
          style={{
            background:
              'radial-gradient(circle at 20% 0%, color-mix(in srgb, var(--tile-accent) 16%, transparent), transparent 55%)',
          }}
        />
        <div className='relative z-10 flex-1'>
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
          {tile.visual === 'mock-popover' ? (
            <MockPopoverVisual
              popoverItems={tile.popoverItems}
              popoverLabel={tile.popoverLabel}
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
        <div className='relative z-10 mt-4 max-w-[24rem]'>
          <h3 className='max-w-[18ch] text-[1.08rem] font-semibold tracking-[-0.04em] text-primary-token sm:text-[1.16rem]'>
            {tile.title}
          </h3>
          <p className='mt-2.5 max-w-[34ch] text-[13px] leading-[1.58] text-secondary-token'>
            {tile.body}
          </p>
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
    <ArtistProfileSectionShell width='page' containerClassName='max-w-none'>
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
