'use client';

// @coverage-via apps/web/components/molecules/drawer/EntityHeader.test.tsx
import { getAvatarArtworkRadiusClassName, getInitials } from '@jovie/ui';
import Image from 'next/image';
import type { ComponentType, ReactNode } from 'react';
import { useState } from 'react';
import {
  STABLE_HEADER_LINE_CLAMP_CLASSNAME,
  STABLE_HEADER_TITLE_HEIGHT_CLASSNAME,
  StableHeaderChipRail,
  type StableHeaderLineCount,
  StableHeaderTextSlot,
} from '@/components/atoms/StableHeaderSlots';
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
 *
 * Consolidated 2026-09-27 (JOV-6842 / Pen odpZ8, drift decision D6): this
 * component is the single owner of the rail header anatomy. The legacy
 * variants — EntityHeaderCard, DrawerHeader, AudienceMemberHeader and
 * ContactDetailHeader — were folded onto it and deleted. `layout='chrome'`
 * covers the utility title bar; new rail-header variants fail CI via the
 * component-family ratchet (JOV-6777).
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

export type EntityHeaderMetaOverflow = 'wrap' | 'scroll';

/**
 * `inline` is the compact legacy flow; `grid` assigns media, identity,
 * metadata, and actions to explicit cells; `chrome` is the utility-only
 * rail title bar (title left, actions right — no entity anatomy).
 */
export type EntityHeaderLayout = 'inline' | 'grid' | 'chrome';

export interface EntityHeaderProps {
  /** Identity media slot — EntityHeaderThumbnail, avatar, artwork, etc. */
  readonly thumbnail?: ReactNode;
  /** Optional small label above the title */
  readonly eyebrow?: ReactNode;
  /** The only 100%-strength text in the rail. */
  readonly title: ReactNode;
  /** One quiet line, e.g. "Tim White · Single" or "Maya Vale · DSP". */
  readonly subtitle?: ReactNode;
  /** Icon-only state indicator — pass an `EntityHeaderStatusGlyph`. */
  readonly statusGlyph?: ReactNode;
  /** Optional badge rendered inline after the title (e.g. verified icon) */
  readonly badge?: ReactNode;
  /** Optional tertiary metadata block rendered beneath subtitle */
  readonly meta?: ReactNode;
  /** Trailing actions slot (overflow menu, header actions, close button). */
  readonly actions?: ReactNode;
  /** Optional footer rendered below the meta block */
  readonly footer?: ReactNode;
  readonly layout?: EntityHeaderLayout;
  /** Enables reserved header slots so entity selection changes do not resize the header. */
  readonly stableLayout?: boolean;
  /** Max title lines before truncation. Stable layouts reserve this line count. */
  readonly titleLineClamp?: StableHeaderLineCount;
  /** Max subtitle lines before truncation. Stable layouts reserve this line count. */
  readonly subtitleLineClamp?: StableHeaderLineCount;
  /** Reserve the eyebrow row even when no eyebrow is available. */
  readonly reserveEyebrowSlot?: boolean;
  /** Reserve the subtitle row even when no subtitle is available. */
  readonly reserveSubtitleSlot?: boolean;
  /** Reserve the metadata row even when no metadata is available. */
  readonly reserveMetaSlot?: boolean;
  /** Reserve the footer row even when no footer is available. */
  readonly reserveFooterSlot?: boolean;
  /** Metadata can either wrap or stay in a one-line horizontal rail. */
  readonly metaOverflow?: EntityHeaderMetaOverflow;
  readonly className?: string;
  readonly bodyClassName?: string;
  readonly titleClassName?: string;
  readonly subtitleClassName?: string;
  readonly metaClassName?: string;
  readonly footerClassName?: string;
  readonly 'data-testid'?: string;
}

function EntityHeaderMetaSlot({
  meta,
  shouldReserveMeta,
  resolvedMetaOverflow,
  metaClassName,
}: Readonly<{
  meta?: ReactNode;
  shouldReserveMeta: boolean;
  resolvedMetaOverflow: EntityHeaderMetaOverflow;
  metaClassName?: string;
}>) {
  if (!meta && !shouldReserveMeta) {
    return null;
  }

  if (resolvedMetaOverflow === 'scroll') {
    return (
      <StableHeaderChipRail
        reserve={shouldReserveMeta}
        className={cn('pt-0.5', metaClassName)}
        testId='entity-header-meta-slot'
      >
        {meta}
      </StableHeaderChipRail>
    );
  }

  return (
    <div
      aria-hidden={meta ? undefined : true}
      className={cn(
        'flex min-h-6 flex-wrap items-center gap-1 pt-0.5',
        !meta && 'invisible',
        metaClassName
      )}
      data-testid='entity-header-meta-slot'
    >
      {meta ?? ' '}
    </div>
  );
}

function EntityHeaderFooterSlot({
  footer,
  shouldReserveFooter,
  footerClassName,
}: Readonly<{
  footer?: ReactNode;
  shouldReserveFooter: boolean;
  footerClassName?: string;
}>) {
  if (!footer && !shouldReserveFooter) {
    return null;
  }

  return (
    <div
      aria-hidden={footer ? undefined : true}
      className={cn('min-h-7 pt-1', !footer && 'invisible', footerClassName)}
    >
      {footer ?? ' '}
    </div>
  );
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
  eyebrow,
  title,
  subtitle,
  statusGlyph,
  badge,
  meta,
  actions,
  footer,
  layout = 'inline',
  stableLayout = false,
  titleLineClamp,
  subtitleLineClamp,
  reserveEyebrowSlot,
  reserveSubtitleSlot,
  reserveMetaSlot,
  reserveFooterSlot,
  metaOverflow,
  className,
  bodyClassName,
  titleClassName,
  subtitleClassName,
  metaClassName,
  footerClassName,
  'data-testid': testId = 'entity-header',
}: EntityHeaderProps) {
  if (layout === 'chrome') {
    return (
      <div
        className={cn(
          'min-h-10 shrink-0 bg-transparent px-3 py-1.5',
          'flex items-center justify-between gap-3',
          className
        )}
        data-layout='chrome'
        data-testid={testId}
      >
        <div className='min-w-0 flex-1'>
          {typeof title === 'string' ? (
            <p className='truncate text-xs font-semibold tracking-[-0.012em] text-primary-token'>
              {title}
            </p>
          ) : (
            (title ?? <div aria-hidden='true' className='h-4' />)
          )}
        </div>
        {actions && <div className='flex items-center gap-1'>{actions}</div>}
      </div>
    );
  }

  const resolvedTitleLineClamp =
    titleLineClamp ?? (stableLayout ? 1 : undefined);
  const shouldReserveEyebrow = reserveEyebrowSlot ?? false;
  const shouldReserveSubtitle = reserveSubtitleSlot ?? stableLayout;
  const shouldReserveMeta = reserveMetaSlot ?? stableLayout;
  const shouldReserveFooter = reserveFooterSlot ?? false;
  const resolvedSubtitleLineClamp =
    subtitleLineClamp ?? (shouldReserveSubtitle ? 1 : undefined);
  const resolvedMetaOverflow: EntityHeaderMetaOverflow =
    metaOverflow ?? (stableLayout ? 'scroll' : 'wrap');

  const identityContent = (
    <>
      {eyebrow || shouldReserveEyebrow ? (
        <StableHeaderTextSlot
          reserve={shouldReserveEyebrow}
          lineCount={1}
          size='xs'
          className='text-3xs font-caption leading-none tracking-[0.03em] text-tertiary-token'
        >
          {eyebrow}
        </StableHeaderTextSlot>
      ) : null}
      <div className='flex items-start gap-1'>
        <h2
          title={typeof title === 'string' ? title : undefined}
          data-testid='entity-header-title'
          className={cn(
            'min-w-0 flex-1 text-sm font-semibold leading-[18px] tracking-[-0.015em] text-primary-token',
            resolvedTitleLineClamp
              ? STABLE_HEADER_LINE_CLAMP_CLASSNAME[resolvedTitleLineClamp]
              : 'truncate',
            stableLayout &&
              resolvedTitleLineClamp &&
              STABLE_HEADER_TITLE_HEIGHT_CLASSNAME[resolvedTitleLineClamp],
            titleClassName
          )}
        >
          {title}
        </h2>
        {badge}
      </div>
      {subtitle || statusGlyph || shouldReserveSubtitle ? (
        <StableHeaderTextSlot
          reserve={shouldReserveSubtitle}
          lineCount={resolvedSubtitleLineClamp}
          size='xs'
          className={cn(
            'text-xs leading-4 tracking-[-0.005em] text-secondary-token',
            subtitleClassName
          )}
          testId='entity-header-details-row'
        >
          {statusGlyph ? (
            <span className='flex min-w-0 items-center gap-1.5'>
              {subtitle ? (
                <span
                  className='min-w-0 truncate'
                  data-testid='entity-header-details'
                >
                  {subtitle}
                </span>
              ) : null}
              {statusGlyph}
            </span>
          ) : (
            subtitle
          )}
        </StableHeaderTextSlot>
      ) : null}
    </>
  );

  const metadataContent = (
    <>
      <EntityHeaderMetaSlot
        meta={meta}
        shouldReserveMeta={shouldReserveMeta}
        resolvedMetaOverflow={resolvedMetaOverflow}
        metaClassName={metaClassName}
      />
      <EntityHeaderFooterSlot
        footer={footer}
        shouldReserveFooter={shouldReserveFooter}
        footerClassName={footerClassName}
      />
    </>
  );

  if (layout === 'grid') {
    return (
      <div
        className={cn(
          'grid grid-cols-[auto_minmax(0,1fr)_auto] grid-rows-[auto_auto] items-start gap-x-3 gap-y-1.5',
          className
        )}
        data-layout='grid'
        data-testid={testId}
      >
        {thumbnail ? (
          <div
            className='col-start-1 row-span-2 row-start-1'
            data-entity-header-image
          >
            {thumbnail}
          </div>
        ) : null}
        <div
          className={cn(
            'col-start-2 row-start-1 min-w-0 space-y-1',
            bodyClassName
          )}
          data-entity-header-identity
        >
          {identityContent}
        </div>
        {actions ? (
          <div
            className='col-start-3 row-start-1 justify-self-end'
            data-entity-header-actions
          >
            {actions}
          </div>
        ) : null}
        {meta || shouldReserveMeta || footer || shouldReserveFooter ? (
          <div
            className='col-span-2 col-start-2 row-start-2 min-w-0'
            data-entity-header-metadata
          >
            {metadataContent}
          </div>
        ) : null}
      </div>
    );
  }

  return (
    <div
      className={cn('relative flex items-start gap-3', className)}
      data-layout='inline'
      data-testid={testId}
    >
      {actions ? (
        <div className='absolute right-0 top-0' data-entity-header-actions>
          {actions}
        </div>
      ) : null}
      {thumbnail ?? null}
      <div className={cn('min-w-0 flex-1 space-y-1', bodyClassName)}>
        {identityContent}
        {metadataContent}
      </div>
    </div>
  );
}
