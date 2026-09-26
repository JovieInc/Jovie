'use client';

// @coverage-via apps/web/components/molecules/drawer/EntityHeader.test.tsx
import { getAvatarArtworkRadiusClassName, getInitials } from '@jovie/ui';
import Image from 'next/image';
import type { ComponentType, ReactNode } from 'react';
import { useState } from 'react';
import { Tooltip } from '@/components/shell/Tooltip';
import { cn } from '@/lib/utils';

/**
 * EntityHeader — the ONE right-rail identity header shared by every entity
 * inspector (releases/songs, people/contacts/fans, events, DSP connections).
 *
 * Founder principle (Tim, 2026-09-25): every rail opens with a 56px
 * thumbnail, ONE dominant title (the only 100%-strength text in the rail),
 * one quiet details line, a status GLYPH (icon only — the state name lives
 * in the tooltip + aria-label, never as visible text), and a trailing
 * actions slot. Detail rows below this header are the compressed tail —
 * they must never repeat a fact this header already states.
 */

export const ENTITY_HEADER_THUMBNAIL_SIZE_PX = 56;
const ENTITY_HEADER_THUMBNAIL_SIZE_CLASSNAME = 'size-14';

export type EntityHeaderThumbnailVariant = 'artwork' | 'person' | 'connection';

export interface EntityHeaderThumbnailProps {
  /** `artwork` = release/song art (rounded square, never cropped). `person` =
   * contact/fan avatar (circle). `connection` = DSP/provider glyph on a
   * subtle tint (circle). */
  readonly variant: EntityHeaderThumbnailVariant;
  readonly src?: string | null;
  readonly alt?: string;
  /** Used for initials fallback (person) and default alt text. */
  readonly name?: string;
  /** Provider glyph rendered for the `connection` variant. */
  readonly icon?: ReactNode;
  /** Overrides the default fallback content shown when no image resolves. */
  readonly fallback?: ReactNode;
  readonly className?: string;
  readonly 'data-testid'?: string;
}

/**
 * Canonical 56px identity thumbnail. Shape and crop behavior follow the
 * entity kind, not the call site — release art is never cropped
 * (`object-contain`, rounded square); people are circles.
 */
export function EntityHeaderThumbnail({
  variant,
  src,
  alt,
  name,
  icon,
  fallback,
  className,
  'data-testid': testId,
}: EntityHeaderThumbnailProps) {
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  const resolvedSrc = src && src !== failedSrc ? src : null;

  if (variant === 'connection') {
    return (
      <div
        data-testid={testId}
        data-entity-header-thumbnail-variant={variant}
        className={cn(
          ENTITY_HEADER_THUMBNAIL_SIZE_CLASSNAME,
          'grid shrink-0 place-items-center rounded-full bg-surface-2 text-secondary-token',
          className
        )}
      >
        {icon}
      </div>
    );
  }

  const shapeClassName =
    variant === 'person'
      ? 'rounded-full'
      : getAvatarArtworkRadiusClassName(ENTITY_HEADER_THUMBNAIL_SIZE_PX);
  const defaultFallback =
    variant === 'person' ? (
      <span className='text-sm font-semibold tracking-tight text-secondary-token'>
        {getInitials(name ?? '')}
      </span>
    ) : null;

  return (
    <div
      data-testid={testId}
      data-entity-header-thumbnail-variant={variant}
      className={cn(
        ENTITY_HEADER_THUMBNAIL_SIZE_CLASSNAME,
        'relative shrink-0 overflow-hidden bg-surface-1 outline outline-1 -outline-offset-1 outline-black/10 dark:outline-white/10',
        shapeClassName,
        className
      )}
    >
      {resolvedSrc ? (
        <Image
          src={resolvedSrc}
          alt={alt ?? name ?? ''}
          fill
          sizes={`${ENTITY_HEADER_THUMBNAIL_SIZE_PX}px`}
          className={variant === 'artwork' ? 'object-contain' : 'object-cover'}
          onError={() => setFailedSrc(src ?? null)}
        />
      ) : (
        <div className='flex h-full w-full items-center justify-center'>
          {fallback ?? defaultFallback}
        </div>
      )}
    </div>
  );
}

export type EntityHeaderStatusTone =
  | 'neutral'
  | 'positive'
  | 'warning'
  | 'danger';

export interface EntityHeaderStatusGlyphProps {
  /** Icon component only — the state name is never rendered as visible text. */
  readonly icon: ComponentType<{
    readonly className?: string;
    readonly 'aria-hidden'?: boolean;
  }>;
  /** State name — surfaced via tooltip (hover) and aria-label (assistive tech). */
  readonly label: string;
  readonly tone?: EntityHeaderStatusTone;
  readonly className?: string;
}

const STATUS_GLYPH_TONE_CLASSNAME: Record<EntityHeaderStatusTone, string> = {
  neutral: 'text-tertiary-token',
  positive: 'text-success',
  warning: 'text-warning',
  danger: 'text-destructive',
};

/**
 * Icon-only entity status indicator. The state name is never printed as a
 * visible word — it is exposed through the hover tooltip and `aria-label`
 * only. Non-color cue: each state must use a distinct icon, not just a tint.
 */
export function EntityHeaderStatusGlyph({
  icon: StatusIcon,
  label,
  tone = 'neutral',
  className,
}: EntityHeaderStatusGlyphProps) {
  return (
    <Tooltip label={label}>
      <span
        role='img'
        aria-label={label}
        data-testid='entity-header-status-glyph'
        className={cn(
          'inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full',
          STATUS_GLYPH_TONE_CLASSNAME[tone],
          className
        )}
      >
        <StatusIcon className='h-3.5 w-3.5' aria-hidden={true} />
      </span>
    </Tooltip>
  );
}

export interface EntityHeaderProps {
  /** 56px identity thumbnail — pass an `EntityHeaderThumbnail`. */
  readonly thumbnail: ReactNode;
  /** The only 100%-strength text in the rail. */
  readonly title: string;
  /** One quiet line, e.g. "Tim White · Single" or "Maya Vale · DSP". */
  readonly details?: ReactNode;
  /** Icon-only state indicator — pass an `EntityHeaderStatusGlyph`. */
  readonly statusGlyph?: ReactNode;
  /** Trailing actions slot (typically an overflow "…" menu). */
  readonly actions?: ReactNode;
  readonly className?: string;
  readonly titleClassName?: string;
  readonly detailsClassName?: string;
  readonly 'data-testid'?: string;
}

/**
 * The shared right-rail Entity Header. Every inspector (release, contact,
 * audience member, event, DSP connection) opens with this — see the module
 * doc comment for the founder-locked contract. Composition only: this
 * component owns layout, not surface chrome (the rail's elevated surface,
 * hairline border, and shadow belong to the shell that mounts it).
 */
export function EntityHeader({
  thumbnail,
  title,
  details,
  statusGlyph,
  actions,
  className,
  titleClassName,
  detailsClassName,
  'data-testid': testId = 'entity-header',
}: EntityHeaderProps) {
  const hasDetailsRow = Boolean(details || statusGlyph);

  return (
    <div
      className={cn('relative flex items-start gap-3', className)}
      data-testid={testId}
    >
      {thumbnail}
      <div className={cn('min-w-0 flex-1 space-y-0.5', actions && 'pr-7')}>
        <h2
          title={title}
          data-testid='entity-header-title'
          className={cn(
            'truncate text-sm font-semibold leading-tight tracking-tight text-primary-token',
            titleClassName
          )}
        >
          {title}
        </h2>
        {hasDetailsRow ? (
          <div
            className='flex min-w-0 items-center gap-1.5'
            data-testid='entity-header-details-row'
          >
            {details ? (
              <span
                className={cn(
                  'min-w-0 truncate text-xs leading-4 text-secondary-token',
                  detailsClassName
                )}
                data-testid='entity-header-details'
              >
                {details}
              </span>
            ) : null}
            {statusGlyph}
          </div>
        ) : null}
      </div>
      {actions ? (
        <div className='absolute right-0 top-0' data-entity-header-actions>
          {actions}
        </div>
      ) : null}
    </div>
  );
}
