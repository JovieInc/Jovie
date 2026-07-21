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
import type { ArtistProfileLandingCopy } from '@/data/artistProfileCopy';
import type { ArtistProfileTruthTile } from '@/data/artistProfileFeatures';
import type { MarketingFeatureTile } from '@/data/marketingFeatureTiles';
import { cn } from '@/lib/utils';
import { ArtistProfileSectionHeader } from './ArtistProfileSectionHeader';
import { ArtistProfileSectionShell } from './ArtistProfileSectionShell';

const TITLE_ACCENT: Record<MarketingFeatureTile['accent'], string> = {
  gray: 'text-secondary-token',
  blue: 'text-accent-blue',
  purple: 'text-accent-purple',
  pink: 'text-accent-pink',
  red: 'text-accent-red',
  orange: 'text-accent-orange',
  green: 'text-accent-green',
  teal: 'text-accent-teal',
};

interface ArtistProfileSpecWallProps {
  readonly specWall: ArtistProfileLandingCopy['specWall'];
  readonly tiles?: readonly MarketingFeatureTile[];
  readonly truthTiles?: readonly ArtistProfileTruthTile[];
}

function ScreenshotCrop({
  alt,
  className,
  imageClassName,
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
        'relative h-full w-full overflow-hidden rounded-2xl bg-base ring-1 ring-inset ring-subtle',
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
      className='flex h-full min-h-36 items-center justify-center rounded-2xl bg-surface-0'
    >
      <div className='inline-flex items-center gap-2 rounded-full border border-subtle bg-surface-1 px-4 py-2.5 text-xs font-semibold text-primary-token'>
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
      className='flex h-full min-h-36 items-center justify-center rounded-2xl bg-surface-0'
    >
      <div className='flex flex-col items-center gap-3 text-center'>
        <span className='inline-flex h-12 w-12 items-center justify-center rounded-full border border-subtle bg-surface-1 text-primary-token'>
          <Icon className='h-5 w-5' strokeWidth={2} />
        </span>
        <p className='text-xs font-medium tracking-normal text-secondary-token'>
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
      className='flex h-full min-h-52 items-center justify-center rounded-2xl bg-surface-0 p-4'
    >
      <div className='w-full max-w-xs rounded-2xl border border-subtle bg-surface-1 p-3'>
        <div className='inline-flex rounded-full border border-subtle bg-surface-1 px-3 py-1.5 text-2xs font-semibold text-primary-token'>
          {popoverLabel}
        </div>
        <div className='mt-3 space-y-2 rounded-2xl bg-surface-0 p-2.5'>
          {popoverItems.map(item => (
            <div
              key={item}
              className='rounded-2xl border border-subtle bg-surface-1 px-3 py-2 text-2xs font-medium text-secondary-token'
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
    { label: 'Bots', detail: 'Filtered', Icon: Bot },
    { label: 'Team', detail: 'Excluded', Icon: Users },
    { label: 'Test Traffic', detail: 'Removed', Icon: FlaskConical },
  ] as const;

  return (
    <div
      role='img'
      aria-label='Audience Quality Filtering Preview'
      className='relative flex h-full min-h-52 overflow-hidden rounded-2xl border border-subtle bg-surface-0 p-4'
    >
      <div className='relative z-10 grid w-full grid-cols-3 items-center gap-3'>
        <div className='space-y-2'>
          {rows.map(({ detail, Icon, label }) => (
            <div
              key={label}
              className='flex items-center gap-2 rounded-2xl border border-subtle bg-surface-1 px-2.5 py-2 text-left'
            >
              <span className='flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-surface-0 text-tertiary-token'>
                <Icon aria-hidden='true' className='h-3.5 w-3.5' />
              </span>
              <span className='min-w-0'>
                <span className='block text-2xs font-semibold leading-tight text-secondary-token'>
                  {label}
                </span>
                <span className='block text-2xs leading-tight text-tertiary-token'>
                  {detail}
                </span>
              </span>
            </div>
          ))}
        </div>

        <div className='flex flex-col items-center gap-2 text-tertiary-token'>
          <span className='flex h-10 w-10 items-center justify-center rounded-full border border-subtle bg-surface-1 text-accent-blue'>
            <Filter aria-hidden='true' className='h-4 w-4' />
          </span>
          <span className='h-10 w-px bg-subtle' />
        </div>

        <div className='rounded-2xl border border-subtle bg-surface-1 p-3 text-left'>
          <div className='flex items-center gap-2'>
            <span className='flex h-7 w-7 items-center justify-center rounded-full bg-accent-green text-primary-token'>
              <CheckCircle2 aria-hidden='true' className='h-3.5 w-3.5' />
            </span>
            <span className='text-xs font-semibold text-primary-token'>
              Actual Fans
            </span>
          </div>
          <div className='mt-4 space-y-2'>
            <span className='block h-1.5 w-full rounded-full bg-accent-green' />
            <span className='block h-1.5 w-4/5 rounded-full bg-surface-0' />
            <span className='block h-1.5 w-3/5 rounded-full bg-surface-0' />
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
  return (
    <article
      className={cn(
        'relative min-h-52',
        tile.size === 'large' ? 'md:min-h-64' : 'md:min-h-52',
        tile.layoutClassName
      )}
    >
      <div className='relative flex h-full flex-col overflow-hidden rounded-2xl border border-subtle bg-base p-4'>
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
              className='h-full min-h-52'
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
              className='h-full min-h-52'
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
          <h3
            className={cn(
              'max-w-xl text-lg font-semibold tracking-normal sm:text-xl',
              TITLE_ACCENT[tile.accent]
            )}
          >
            {tile.title}
          </h3>
          <p className='mt-2.5 max-w-xl text-app leading-relaxed text-tertiary-token'>
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
  truthTiles,
}: Readonly<ArtistProfileSpecWallProps>) {
  if (truthTiles) {
    return (
      <ArtistProfileSectionShell width='page'>
        <div className='mx-auto max-w-public-content'>
          <ArtistProfileSectionHeader
            align='left'
            headline={specWall.headline}
            body={specWall.subhead}
            className='max-w-3xl'
            bodyClassName='max-w-xl'
          />

          <ol className='mt-10 grid border-t border-subtle sm:grid-cols-2 lg:grid-cols-5'>
            {truthTiles.map((tile, index) => (
              <li
                key={tile.id}
                data-testid='artist-profile-truth-tile'
                className='min-h-44 border-b border-subtle p-5 sm:border-r sm:[&:nth-child(2n)]:border-r-0 lg:border-r lg:[&:nth-child(5n)]:border-r-0'
              >
                <p className='font-mono text-2xs text-tertiary-token'>
                  {String(index + 1).padStart(2, '0')}
                </p>
                <h3 className='mt-8 text-sm font-semibold text-primary-token'>
                  {tile.title}
                </h3>
                <p className='mt-3 text-app leading-relaxed text-secondary-token'>
                  {tile.body}
                </p>
              </li>
            ))}
          </ol>
        </div>
      </ArtistProfileSectionShell>
    );
  }

  return (
    <ArtistProfileSectionShell width='page' containerClassName='max-w-none'>
      <div className='mx-auto max-w-public-content'>
        <ArtistProfileSectionHeader
          align='left'
          headline={specWall.headline}
          body={specWall.subhead}
          className='max-w-2xl'
          bodyClassName='max-w-xl'
        />

        <div className='mt-6 grid gap-3 md:grid-cols-2 xl:grid-cols-12 xl:grid-rows-4 xl:gap-4'>
          {(tiles ?? []).map(tile => (
            <ArtistProfilePowerFeatureTile key={tile.id} tile={tile} />
          ))}
        </div>
      </div>
    </ArtistProfileSectionShell>
  );
}
