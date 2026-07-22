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
import './ArtistProfileSpecWall.css';
import { ArtistProfileSectionHeader } from './ArtistProfileSectionHeader';
import { ArtistProfileSectionShell } from './ArtistProfileSectionShell';

// Founder accent rule: feature accent color lives on the tile title text
// only, mapped to the Geist --color-accent-* palette via colocated CSS.
const TILE_TITLE_ACCENT_CLASSES: Record<
  MarketingFeatureTile['accent'],
  string
> = {
  gray: 'ap-spec-wall__tile-title--accent-gray',
  blue: 'ap-spec-wall__tile-title--accent-blue',
  purple: 'ap-spec-wall__tile-title--accent-purple',
  pink: 'ap-spec-wall__tile-title--accent-pink',
  red: 'ap-spec-wall__tile-title--accent-red',
  orange: 'ap-spec-wall__tile-title--accent-orange',
  green: 'ap-spec-wall__tile-title--accent-green',
  teal: 'ap-spec-wall__tile-title--accent-teal',
};

// Inline object-position styles are retired; the data files only use these
// two positions, which map onto the standard object-* utilities.
const OBJECT_POSITION_CLASSES: Record<string, string> = {
  'center top': 'object-top',
  '50% 0%': 'object-top',
  '50% 50%': 'object-center',
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
        'ap-spec-wall__shot relative h-full w-full overflow-hidden',
        className
      )}
    >
      <Image
        fill
        alt={alt}
        className={cn(
          'object-contain',
          imageClassName,
          objectPosition ? OBJECT_POSITION_CLASSES[objectPosition] : null
        )}
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
      className='ap-spec-wall__stage flex h-full min-h-36 items-center justify-center'
    >
      <div className='ap-spec-wall__chip inline-flex items-center gap-2 rounded-full border border-default bg-surface-1 px-4 py-2.5 text-xs font-semibold text-primary-token'>
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
      className='ap-spec-wall__stage flex h-full min-h-36 items-center justify-center'
    >
      <div className='flex flex-col items-center gap-3 text-center'>
        <span className='ap-spec-wall__badge inline-flex h-12 w-12 items-center justify-center rounded-full border border-default bg-surface-1 text-primary-token'>
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
      className='ap-spec-wall__stage ap-spec-wall__stage--popover flex h-full min-h-40 items-center justify-center p-4'
    >
      <div className='ap-spec-wall__popover w-full max-w-60 border border-subtle bg-surface-input p-3'>
        <div className='inline-flex rounded-full border border-default bg-surface-1 px-3 py-1.5 text-2xs font-semibold text-primary-token'>
          {popoverLabel}
        </div>
        <div className='ap-spec-wall__popover-list mt-3 space-y-2 bg-surface-0 p-2.5'>
          {popoverItems.map(item => (
            <div
              key={item}
              className='ap-spec-wall__popover-item px-3 py-2 text-2xs font-medium text-secondary-token'
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
      className='ap-spec-wall__stage ap-spec-wall__stage--filter relative flex h-full min-h-52 overflow-hidden border border-subtle p-4'
    >
      <div aria-hidden='true' className='ap-spec-wall__aqf-ring-outer' />
      <div
        aria-hidden='true'
        className='ap-spec-wall__aqf-ring-inner motion-safe:animate-pulse motion-reduce:animate-none'
      />
      <div aria-hidden='true' className='ap-spec-wall__aqf-scan' />
      <div className='relative z-10 grid w-full grid-cols-[minmax(0,1fr)_3.25rem_minmax(0,1fr)] items-center gap-3'>
        <div className='space-y-2'>
          {rows.map(({ detail, Icon, label }) => (
            <div
              key={label}
              className='ap-spec-wall__aqf-row flex items-center gap-2 border border-subtle px-2.5 py-2 text-left'
            >
              <span className='ap-spec-wall__aqf-row-icon flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-tertiary-token'>
                <Icon aria-hidden='true' className='h-3.5 w-3.5' />
              </span>
              <span className='min-w-0'>
                <span className='block text-3xs font-semibold leading-tight text-secondary-token sm:text-2xs'>
                  {label}
                </span>
                <span className='block text-3xs leading-tight text-tertiary-token'>
                  {detail}
                </span>
              </span>
            </div>
          ))}
        </div>

        <div className='flex flex-col items-center gap-2 text-tertiary-token'>
          <span className='ap-spec-wall__aqf-filter flex h-10 w-10 items-center justify-center rounded-full border text-secondary-token'>
            <Filter aria-hidden='true' className='h-4 w-4' />
          </span>
          <span className='ap-spec-wall__aqf-connector h-10 w-px' />
        </div>

        <div className='ap-spec-wall__aqf-result p-3 text-left'>
          <div className='flex items-center gap-2'>
            <span className='ap-spec-wall__aqf-result-icon flex h-7 w-7 items-center justify-center rounded-full bg-success'>
              <CheckCircle2 aria-hidden='true' className='h-3.5 w-3.5' />
            </span>
            <span className='text-xs font-semibold text-primary-token'>
              Actual Fans
            </span>
          </div>
          <div className='mt-4 space-y-2'>
            <span className='ap-spec-wall__aqf-result-bar--success block h-1.5 w-full rounded-full' />
            <span className='ap-spec-wall__aqf-result-bar--strong block h-1.5 w-4/5 rounded-full' />
            <span className='ap-spec-wall__aqf-result-bar--subtle block h-1.5 w-3/5 rounded-full' />
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
        tile.size === 'large' ? 'md:min-h-66' : 'md:min-h-52',
        tile.layoutClassName
      )}
    >
      <div className='ap-spec-wall__tile-card relative flex h-full flex-col overflow-hidden border border-subtle bg-base p-4'>
        <div aria-hidden='true' className='ap-spec-wall__tile-hairline' />
        <div
          aria-hidden='true'
          className='ap-spec-wall__tile-glow pointer-events-none absolute -right-16 -top-16 hidden h-44 w-44 rounded-full blur-3xl sm:block'
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
              className='h-full min-h-48'
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
              className='h-full min-h-48'
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
              'ap-spec-wall__tile-title font-semibold',
              TILE_TITLE_ACCENT_CLASSES[tile.accent]
            )}
          >
            {tile.title}
          </h3>
          <p className='ap-spec-wall__tile-body mt-2.5 text-app text-tertiary-token'>
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
                <p className='font-mono text-3xs text-tertiary-token'>
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
          className='max-w-176'
          headlineClassName=''
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
