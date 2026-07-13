import {
  BarChart2,
  Bot,
  CheckCircle2,
  Download,
  Filter,
  FlaskConical,
  Music2,
  RefreshCw,
  Users,
  Zap,
} from 'lucide-react';
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
  priority = false,
  src,
}: Readonly<{
  alt: string;
  className?: string;
  frameClassName?: string;
  imageClassName?: string;
  objectPosition?: string;
  priority?: boolean;
  screenshotHeight?: number;
  screenshotWidth?: number;
  src: string;
}>) {
  return (
    <div
      className={cn(
        'relative h-full w-full overflow-hidden rounded-[0.85rem] bg-(--color-bg-base) ring-1 ring-inset ring-white/[0.07]',
        className
      )}
    >
      <Image
        fill
        alt={alt}
        className={cn('object-contain', imageClassName)}
        priority={priority}
        sizes='(min-width: 1280px) 420px, (min-width: 768px) 45vw, 100vw'
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
      className='flex h-full min-h-36 items-center justify-center rounded-[0.9rem] bg-[radial-gradient(circle_at_50%_15%,rgba(255,255,255,0.08),transparent_38%),#070a0f]'
    >
      <div className='inline-flex items-center gap-2 rounded-full border border-white/10 bg-white dark:bg-surface-1 px-4 py-2.5 text-xs font-semibold text-black dark:text-white shadow-[0_14px_26px_rgba(0,0,0,0.22)]'>
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
  badgeIcon: 'speed' | 'sync' | 'chart';
  badgeLabel: string;
}>) {
  let Icon: typeof RefreshCw;
  if (badgeIcon === 'sync') {
    Icon = RefreshCw;
  } else if (badgeIcon === 'chart') {
    Icon = BarChart2;
  } else {
    Icon = Zap;
  }

  return (
    <div
      role='img'
      aria-label={`${badgeLabel} preview`}
      className='flex h-full min-h-36 items-center justify-center rounded-[0.9rem] bg-[radial-gradient(circle_at_50%_15%,rgba(255,255,255,0.08),transparent_38%),#070a0f]'
    >
      <div className='flex flex-col items-center gap-3 text-center'>
        <span className='inline-flex h-12 w-12 items-center justify-center rounded-full border border-white/10 bg-white dark:bg-surface-1 text-black dark:text-white shadow-[0_16px_28px_rgba(0,0,0,0.22)]'>
          <Icon className='h-5 w-5' strokeWidth={2} />
        </span>
        <p className='text-xs font-medium tracking-normal text-white/76'>
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
      className='flex h-full min-h-[10rem] items-center justify-center rounded-[0.9rem] bg-[radial-gradient(circle_at_50%_15%,rgba(20,184,166,0.09),transparent_40%),#070a0f] p-4'
    >
      <div className='w-full max-w-[15rem] rounded-[0.9rem] border border-white/[0.07] bg-(--color-bg-input) p-3 shadow-[0_18px_40px_rgba(0,0,0,0.22)]'>
        <div className='inline-flex rounded-full border border-white/10 bg-white dark:bg-surface-1 px-3 py-1.5 text-2xs font-semibold text-black dark:text-white'>
          {popoverLabel}
        </div>
        <div className='mt-3 space-y-2 rounded-[0.8rem] bg-(--color-bg-surface-0) p-2.5'>
          {popoverItems.map(item => (
            <div
              key={item}
              className='rounded-[0.6rem] border border-white/[0.06] bg-white/[0.035] px-3 py-2 text-2xs font-medium text-white/72'
            >
              {item}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function AudienceQualityFilterVisual() {
  const rows = [
    {
      label: 'Bots',
      detail: 'Filtered',
      Icon: Bot,
    },
    {
      label: 'Team',
      detail: 'Excluded',
      Icon: Users,
    },
    {
      label: 'Test Traffic',
      detail: 'Removed',
      Icon: FlaskConical,
    },
  ] as const;

  return (
    <div
      role='img'
      aria-label='Audience Quality Filtering Preview'
      className='relative flex h-full min-h-[13rem] overflow-hidden rounded-[0.9rem] border border-white/[0.07] bg-[radial-gradient(circle_at_50%_18%,rgba(94,106,210,0.18),transparent_34%),#05070b] p-4'
    >
      <div
        aria-hidden='true'
        className='absolute left-1/2 top-[42%] h-40 w-40 -translate-x-1/2 -translate-y-1/2 rounded-full border border-white/[0.08]'
      />
      <div
        aria-hidden='true'
        className='absolute left-1/2 top-[42%] h-28 w-28 -translate-x-1/2 -translate-y-1/2 rounded-full border border-white/[0.1] motion-safe:animate-pulse motion-reduce:animate-none'
      />
      <div
        aria-hidden='true'
        className='absolute left-1/2 top-[42%] h-px w-[120%] -translate-x-1/2 rotate-[-18deg] bg-gradient-to-r from-transparent via-(--tile-accent)/50 to-transparent opacity-70'
      />
      <div className='relative z-10 grid w-full grid-cols-[minmax(0,1fr)_3.25rem_minmax(0,1fr)] items-center gap-3'>
        <div className='space-y-2'>
          {rows.map(({ detail, Icon, label }) => (
            <div
              key={label}
              className='flex items-center gap-2 rounded-[0.7rem] border border-white/[0.07] bg-white/[0.035] px-2.5 py-2 text-left shadow-[0_12px_28px_rgba(0,0,0,0.18)]'
            >
              <span className='flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-white/[0.06] text-white/58'>
                <Icon aria-hidden='true' className='h-3.5 w-3.5' />
              </span>
              <span className='min-w-0'>
                <span className='block text-3xs font-semibold leading-tight text-white/76 sm:text-2xs'>
                  {label}
                </span>
                <span className='block text-3xs leading-tight text-white/64'>
                  {detail}
                </span>
              </span>
            </div>
          ))}
        </div>

        <div className='flex flex-col items-center gap-2 text-white/50'>
          <span className='flex h-10 w-10 items-center justify-center rounded-full border border-(--tile-accent)/30 bg-(--tile-accent)/10 text-(--tile-accent) shadow-[0_0_34px_rgba(94,106,210,0.18)]'>
            <Filter aria-hidden='true' className='h-4 w-4' />
          </span>
          <span className='h-10 w-px bg-gradient-to-b from-(--tile-accent)/45 to-transparent' />
        </div>

        <div className='rounded-[0.8rem] border border-emerald-300/18 bg-emerald-300/[0.07] p-3 text-left shadow-[0_18px_52px_rgba(16,185,129,0.12)]'>
          <div className='flex items-center gap-2'>
            <span className='flex h-7 w-7 items-center justify-center rounded-full bg-emerald-300 text-black dark:text-white'>
              <CheckCircle2 aria-hidden='true' className='h-3.5 w-3.5' />
            </span>
            <span className='text-xs font-semibold text-white dark:text-white'>
              Actual Fans
            </span>
          </div>
          <div className='mt-4 space-y-2'>
            <span className='block h-1.5 w-full rounded-full bg-emerald-300/42' />
            <span className='block h-1.5 w-4/5 rounded-full bg-white/16' />
            <span className='block h-1.5 w-3/5 rounded-full bg-white/10' />
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
  };

  return (
    <article
      className={cn(
        'relative min-h-[13rem]',
        tile.size === 'large' ? 'md:min-h-[16.5rem]' : 'md:min-h-[13rem]',
        tile.layoutClassName
      )}
      style={style}
    >
      <div className='relative flex h-full flex-col overflow-hidden rounded-[1.25rem] border border-white/8 bg-(--color-bg-base) p-4'>
        <div
          aria-hidden='true'
          className='pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-(--tile-accent)/60 to-transparent opacity-80'
        />
        <div
          aria-hidden='true'
          className='pointer-events-none absolute -right-16 -top-16 hidden h-44 w-44 rounded-full bg-(--tile-accent)/12 blur-3xl sm:block'
        />
        <div className='relative flex-1'>
          {tile.visual === 'audience-quality-filter' ? (
            <AudienceQualityFilterVisual />
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
              frameClassName={tile.frameClassName}
              imageClassName='object-top'
              objectPosition={tile.objectPosition}
              screenshotHeight={tile.screenshotHeight}
              screenshotWidth={tile.screenshotWidth}
              src={tile.screenshotSrc}
            />
          ) : null}
          {tile.visual === 'cropped-screenshot' ||
          tile.visual === 'screenshot' ? (
            <ScreenshotCrop
              alt={tile.screenshotAlt}
              className='h-full min-h-[12rem]'
              frameClassName={tile.frameClassName}
              imageClassName={tile.imageClassName}
              objectPosition={tile.objectPosition}
              priority={tile.id === 'rich-analytics'}
              screenshotHeight={tile.screenshotHeight}
              screenshotWidth={tile.screenshotWidth}
              src={tile.screenshotSrc}
            />
          ) : null}
        </div>
        <div className='relative z-10 mt-4 max-w-sm'>
          <h3 className='max-w-[20ch] text-[1.08rem] font-semibold tracking-normal text-white dark:text-white sm:text-[1.16rem]'>
            {tile.title}
          </h3>
          <p className='mt-2.5 max-w-[36ch] text-app leading-[1.58] text-white/54'>
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
      <div className='mx-auto max-w-(--linear-content-max)'>
        <ArtistProfileSectionHeader
          align='left'
          headline={specWall.headline}
          body={specWall.subhead}
          className='max-w-[44rem]'
          headlineClassName=''
          bodyClassName='max-w-xl'
        />

        <div className='mt-6 grid gap-3 md:grid-cols-2 xl:grid-cols-12 xl:grid-rows-4 xl:gap-4'>
          {tiles.map(tile => (
            <ArtistProfilePowerFeatureTile key={tile.id} tile={tile} />
          ))}
        </div>
      </div>
    </ArtistProfileSectionShell>
  );
}
