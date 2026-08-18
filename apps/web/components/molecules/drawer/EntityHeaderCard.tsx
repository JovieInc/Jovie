import type { ReactNode } from 'react';

import {
  STABLE_HEADER_LINE_CLAMP_CLASSNAME,
  STABLE_HEADER_TITLE_HEIGHT_CLASSNAME,
  StableHeaderChipRail,
  type StableHeaderLineCount,
  StableHeaderTextSlot,
} from '@/components/atoms/StableHeaderSlots';
import { cn } from '@/lib/utils';

type EntityHeaderMetaOverflow = 'wrap' | 'scroll';

export interface EntityHeaderCardProps {
  /** Image slot — Avatar, AvatarUploadable, artwork, etc. */
  readonly image?: ReactNode;
  /** Optional small label above the title */
  readonly eyebrow?: ReactNode;
  /** Primary display name / title */
  readonly title: string;
  /** Secondary line — username, artist name, etc. */
  readonly subtitle?: ReactNode;
  /** Optional tertiary metadata block rendered beneath subtitle */
  readonly meta?: ReactNode;
  /** Optional badge rendered inline after the title (e.g. verified icon) */
  readonly badge?: ReactNode;
  /** Optional top-right action slot */
  readonly actions?: ReactNode;
  /**
   * Grid mode assigns image, identity, metadata, and actions to explicit cells.
   * Inline preserves the legacy compact flow for existing consumers.
   */
  readonly layout?: 'inline' | 'grid';
  /** Optional footer rendered below the meta block */
  readonly footer?: ReactNode;
  /** Enables reserved header slots so entity selection changes do not resize the card. */
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
      {meta ?? '\u00a0'}
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
      {footer ?? '\u00a0'}
    </div>
  );
}

/**
 * Shared entity header card used across right-drawer sidebars.
 *
 * Provides the standard layout for entity identification sections
 * (contact avatar, release artwork, profile header) so all entity
 * sidebars look consistent.
 */
export function EntityHeaderCard({
  image,
  eyebrow,
  title,
  subtitle,
  meta,
  badge,
  actions,
  layout = 'inline',
  footer,
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
  'data-testid': testId,
}: EntityHeaderCardProps) {
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
        <span
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
        </span>
        {badge}
      </div>
      {subtitle || shouldReserveSubtitle ? (
        <StableHeaderTextSlot
          reserve={shouldReserveSubtitle}
          lineCount={resolvedSubtitleLineClamp}
          size='xs'
          className={cn(
            'text-xs leading-4 tracking-[-0.005em] text-secondary-token',
            subtitleClassName
          )}
        >
          {subtitle}
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
        {image ? (
          <div
            className='col-start-1 row-span-2 row-start-1'
            data-entity-header-image
          >
            {image}
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
      {actions ? <div className='absolute right-0 top-0'>{actions}</div> : null}
      {image ?? null}
      <div className={cn('min-w-0 flex-1 space-y-1', bodyClassName)}>
        {identityContent}
        {metadataContent}
      </div>
    </div>
  );
}
