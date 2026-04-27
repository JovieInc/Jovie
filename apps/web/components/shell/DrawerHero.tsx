'use client';

import { MoreHorizontal, Play } from 'lucide-react';
import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { Tooltip } from './Tooltip';

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
  /** Optional click handler on the artwork — surfaces a play overlay. */
  readonly onPlay?: () => void;
  readonly playLabel?: string;
  /** Optional overflow-menu button click handler — surfaces in the top-right. */
  readonly onMenu?: (e: React.MouseEvent<HTMLButtonElement>) => void;
  readonly menuLabel?: string;
  readonly className?: string;
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
 *   /* ...other props... *\/
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
  onPlay,
  playLabel,
  onMenu,
  menuLabel = 'Drawer actions',
  className,
}: DrawerHeroProps) {
  const hasTopRight = Boolean(statusBadge || onMenu);
  return (
    <section className={cn('group/drawer relative px-3 pt-3 pb-3', className)}>
      {hasTopRight && (
        <div className='absolute right-3 top-3 flex items-center gap-1.5'>
          {statusBadge}
          {onMenu && (
            <Tooltip label={menuLabel}>
              <button
                type='button'
                onClick={onMenu}
                className='h-6 w-6 rounded grid place-items-center text-quaternary-token hover:text-primary-token hover:bg-surface-1/70 transition-colors duration-150 ease-out opacity-0 group-hover/drawer:opacity-100 focus-visible:opacity-100'
                aria-label={menuLabel}
                aria-haspopup='menu'
              >
                <MoreHorizontal className='h-3.5 w-3.5' strokeWidth={2.25} />
              </button>
            </Tooltip>
          )}
        </div>
      )}

      <div className='flex items-start gap-3'>
        {artwork &&
          (onPlay ? (
            <button
              type='button'
              onClick={onPlay}
              aria-label={playLabel ?? `Play ${title}`}
              className='shrink-0 relative group/art rounded-lg overflow-hidden focus-visible:outline-none'
            >
              {artwork}
              <span
                aria-hidden='true'
                className='absolute inset-0 grid place-items-center bg-black/45 opacity-0 group-hover/art:opacity-100 transition-opacity duration-150 ease-out'
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
          ) : (
            <div className='shrink-0 rounded-lg overflow-hidden'>{artwork}</div>
          ))}

        <div className={cn('flex-1 min-w-0 pt-1', hasTopRight && 'pr-[88px]')}>
          <h2
            className='text-[17px] font-semibold text-primary-token leading-tight'
            style={{ letterSpacing: '-0.018em' }}
          >
            {title}
          </h2>
          {subtitle && (
            <p className='mt-1 text-[12px] text-tertiary-token truncate'>
              {subtitle}
            </p>
          )}
          {meta && (
            <div className='mt-2 flex items-center gap-1.5 flex-wrap'>
              {meta}
            </div>
          )}
        </div>
      </div>

      {trailing && <div className='mt-4'>{trailing}</div>}
    </section>
  );
}
