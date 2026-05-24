'use client';

import { MoreHorizontal, Play } from 'lucide-react';
import type { ReactNode } from 'react';
import {
  STABLE_HEADER_LINE_CLAMP_CLASSNAME,
  STABLE_HEADER_TITLE_HEIGHT_CLASSNAME,
  StableHeaderChipRail,
  type StableHeaderLineCount,
  StableHeaderTextSlot,
} from '@/components/atoms/StableHeaderSlots';
import { cn } from '@/lib/utils';
import { Tooltip } from './Tooltip';

type DrawerHeroMetaOverflow = 'wrap' | 'scroll';

export interface DrawerHeroProps {
  /** Title row (release title, track title, contact name, etc.). */
  readonly title: string;
  /** Optional subtitle line — typical pattern is "Artist · Album" or similar. */
  readonly subtitle?: ReactNode;
  /**
   * Square artwork. Pass a 64–88px image as a ReactNode so callers can use
   * their preferred image primitive (`next/image`, `<ReleaseArtworkThumb>`, etc.).
   */
  readonly artwork?: ReactNode;
  /** Status pill (typically `<StatusBadge>` from `@/components/shell/StatusBadge`). */
  readonly statusBadge?: ReactNode;
  /**
   * Below-subtitle row for entity-specific chips (`<TypeBadge>`, `<DropDateChip>`,
   * etc.). Renders as a flex wrap with 1.5-unit gap.
   */
  readonly meta?: ReactNode;
  /** Below-meta row for inline actions (smart link copy, etc.). */
  readonly trailing?: ReactNode;
  /** Enables reserved header slots so entity selection changes do not resize the card. */
  readonly stableLayout?: boolean;
  /** Max title lines before truncation. Stable layouts reserve this line count. */
  readonly titleLineClamp?: StableHeaderLineCount;
  /** Max subtitle lines before truncation. Stable layouts reserve this line count. */
  readonly subtitleLineClamp?: StableHeaderLineCount;
  /** Reserve the subtitle row even when no subtitle is available. */
  readonly reserveSubtitleSlot?: boolean;
  /** Reserve the metadata row even when no metadata is available. */
  readonly reserveMetaSlot?: boolean;
  /** Reserve the trailing row even when no trailing content is available. */
  readonly reserveTrailingSlot?: boolean;
  /** Metadata can either wrap or stay in a one-line horizontal rail. */
  readonly metaOverflow?: DrawerHeroMetaOverflow;
  /** Optional click handler on the artwork — surfaces a play overlay. */
  readonly onPlay?: () => void;
  readonly playLabel?: string;
  /** Optional overflow-menu button click handler — surfaces in the top-right. */
  readonly onMenu?: (e: React.MouseEvent<HTMLButtonElement>) => void;
  readonly menuLabel?: string;
  readonly className?: string;
  readonly titleClassName?: string;
  readonly subtitleClassName?: string;
  readonly metaClassName?: string;
  readonly trailingClassName?: string;
  readonly testId?: string;
}

function DrawerHeroArtworkSlot({
  artwork,
  onPlay,
  playLabel,
  title,
}: Readonly<{
  artwork?: ReactNode;
  onPlay?: () => void;
  playLabel?: string;
  title: string;
}>) {
  if (!artwork) {
    return null;
  }

  if (!onPlay) {
    return <div className='shrink-0 rounded-lg overflow-hidden'>{artwork}</div>;
  }

  return (
    <button
      type='button'
      onClick={onPlay}
      aria-label={playLabel ?? `Play ${title}`}
      className='shrink-0 relative group/art rounded-lg overflow-hidden focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-token focus-visible:ring-offset-2'
    >
      {artwork}
      <span
        aria-hidden='true'
        className='absolute inset-0 grid place-items-center bg-black/45 opacity-0 group-hover/art:opacity-100 transition-opacity duration-subtle ease-subtle'
      >
        <span className='h-8 w-8 rounded-full bg-white text-black grid place-items-center'>
          <Play
            className='h-4 w-4 translate-x-px'
            strokeWidth={2.5}
            fill='currentColor'
          />
        </span>
      </span>
    </button>
  );
}

function DrawerHeroMetaSlot({
  meta,
  shouldReserveMeta,
  resolvedMetaOverflow,
  metaClassName,
}: Readonly<{
  meta?: ReactNode;
  shouldReserveMeta: boolean;
  resolvedMetaOverflow: DrawerHeroMetaOverflow;
  metaClassName?: string;
}>) {
  if (!meta && !shouldReserveMeta) {
    return null;
  }

  if (resolvedMetaOverflow === 'scroll') {
    return (
      <StableHeaderChipRail
        reserve={shouldReserveMeta}
        className={cn('mt-2', metaClassName)}
        testId='drawer-hero-meta-slot'
      >
        {meta}
      </StableHeaderChipRail>
    );
  }

  return (
    <div
      aria-hidden={meta ? undefined : true}
      className={cn(
        'mt-2 flex min-h-[22px] items-center gap-1.5 flex-wrap',
        !meta && 'invisible',
        metaClassName
      )}
      data-testid='drawer-hero-meta-slot'
    >
      {meta ?? <span>{'\u00a0'}</span>}
    </div>
  );
}

function DrawerHeroTrailingSlot({
  trailing,
  shouldReserveTrailing,
  trailingClassName,
}: Readonly<{
  trailing?: ReactNode;
  shouldReserveTrailing: boolean;
  trailingClassName?: string;
}>) {
  if (!trailing && !shouldReserveTrailing) {
    return null;
  }

  return (
    <div
      aria-hidden={trailing ? undefined : true}
      className={cn(
        'mt-4 min-h-[32px]',
        !trailing && 'invisible',
        trailingClassName
      )}
      data-testid='drawer-hero-trailing-slot'
    >
      {trailing ?? '\u00a0'}
    </div>
  );
}

/**
 * DrawerHero — header card for the right-rail drawer.
 *
 * Mounts inside `EntitySidebarShell.entityHeader` slot. Entity-agnostic;
 * pass any combination of `title` / `subtitle` / `artwork` / `statusBadge` /
 * `meta` / `trailing`. The artwork supports an optional play overlay; the
 * menu button surfaces only when `onMenu` is provided.
 *
 * @example
 * ```tsx
 * <EntitySidebarShell
 *   entityHeader={
 *     <DrawerHero
 *       title={release.title}
 *       subtitle={
 *         <>
 *           <EntityHoverLink entity={lookupArtistEntity(release.artist)}>
 *             {release.artist}
 *           </EntityHoverLink>
 *           <span className='mx-1 text-quaternary-token'>·</span>
 *           {release.album}
 *         </>
 *       }
 *       artwork={
 *         <ReleaseArtworkThumb src={release.artwork} title={release.title} size={88} />
 *       }
 *       statusBadge={<StatusBadge status={release.status} />}
 *       meta={
 *         <>
 *           <TypeBadge type={release.type} />
 *           <DropDateChip date={release.releaseDate} />
 *         </>
 *       }
 *       onPlay={() => playRelease(release.id)}
 *       playLabel={`Play ${release.title}`}
 *       onMenu={openMenu}
 *     />
 *   }
 * />
 * ```
 */
export function DrawerHero({
  title,
  subtitle,
  artwork,
  statusBadge,
  meta,
  trailing,
  stableLayout = false,
  titleLineClamp,
  subtitleLineClamp,
  reserveSubtitleSlot,
  reserveMetaSlot,
  reserveTrailingSlot,
  metaOverflow,
  onPlay,
  playLabel,
  onMenu,
  menuLabel = 'Drawer actions',
  className,
  titleClassName,
  subtitleClassName,
  metaClassName,
  trailingClassName,
  testId,
}: DrawerHeroProps) {
  const hasTopRight = Boolean(statusBadge || onMenu);
  const resolvedTitleLineClamp =
    titleLineClamp ?? (stableLayout ? 2 : undefined);
  const shouldReserveSubtitle = reserveSubtitleSlot ?? stableLayout;
  const shouldReserveMeta = reserveMetaSlot ?? stableLayout;
  const shouldReserveTrailing = reserveTrailingSlot ?? false;
  const resolvedSubtitleLineClamp =
    subtitleLineClamp ?? (shouldReserveSubtitle ? 1 : undefined);
  const resolvedMetaOverflow: DrawerHeroMetaOverflow =
    metaOverflow ?? (stableLayout ? 'scroll' : 'wrap');
  return (
    <section
      className={cn('group/drawer px-3 pt-3 pb-3', className)}
      data-testid={testId}
    >
      <div className='flex items-start gap-3'>
        <DrawerHeroArtworkSlot
          artwork={artwork}
          onPlay={onPlay}
          playLabel={playLabel}
          title={title}
        />

        <div className='flex-1 min-w-0 pt-1'>
          <div className='flex items-start gap-2'>
            <h2
              className={cn(
                'flex-1 min-w-0 text-[17px] font-semibold text-primary-token leading-tight',
                resolvedTitleLineClamp &&
                  STABLE_HEADER_LINE_CLAMP_CLASSNAME[resolvedTitleLineClamp],
                stableLayout &&
                  resolvedTitleLineClamp &&
                  STABLE_HEADER_TITLE_HEIGHT_CLASSNAME[resolvedTitleLineClamp],
                titleClassName
              )}
            >
              {title}
            </h2>
            {hasTopRight && (
              <div className='shrink-0 flex items-center gap-1.5'>
                {statusBadge}
                {onMenu && (
                  <Tooltip label={menuLabel}>
                    <button
                      type='button'
                      onClick={onMenu}
                      className='h-6 w-6 rounded grid place-items-center text-quaternary-token hover:text-primary-token hover:bg-surface-1/70 transition-colors duration-subtle ease-subtle opacity-0 group-hover/drawer:opacity-100 focus-visible:opacity-100 [@media(hover:none)]:opacity-100'
                      aria-label={menuLabel}
                      aria-haspopup='menu'
                    >
                      <MoreHorizontal
                        className='h-3.5 w-3.5'
                        strokeWidth={2.25}
                      />
                    </button>
                  </Tooltip>
                )}
              </div>
            )}
          </div>
          {subtitle || shouldReserveSubtitle ? (
            <StableHeaderTextSlot
              reserve={shouldReserveSubtitle}
              lineCount={resolvedSubtitleLineClamp}
              size='xs'
              className={cn(
                'mt-1 text-[12px] leading-[16px] text-tertiary-token',
                subtitleClassName
              )}
              testId='drawer-hero-subtitle-slot'
            >
              {subtitle}
            </StableHeaderTextSlot>
          ) : null}
          <DrawerHeroMetaSlot
            meta={meta}
            shouldReserveMeta={shouldReserveMeta}
            resolvedMetaOverflow={resolvedMetaOverflow}
            metaClassName={metaClassName}
          />
        </div>
      </div>

      <DrawerHeroTrailingSlot
        trailing={trailing}
        shouldReserveTrailing={shouldReserveTrailing}
        trailingClassName={trailingClassName}
      />
    </section>
  );
}
