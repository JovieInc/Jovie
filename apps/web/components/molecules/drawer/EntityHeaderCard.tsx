import type { ReactNode } from 'react';

import type { StableHeaderLineCount } from '@/components/atoms/StableHeaderSlots';
import { EntityHeader, type EntityHeaderMetaOverflow } from './EntityHeader';

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

/**
 * Compatibility adapter for the retired entity-header API.
 *
 * New call sites use EntityHeader directly. Keeping the adapter thin preserves
 * stale imports without restoring a second owner of right-rail header anatomy.
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
  return (
    <EntityHeader
      thumbnail={image}
      eyebrow={eyebrow}
      title={title}
      subtitle={subtitle}
      meta={meta}
      badge={badge}
      actions={actions}
      layout={layout}
      footer={footer}
      stableLayout={stableLayout}
      titleLineClamp={titleLineClamp}
      subtitleLineClamp={subtitleLineClamp}
      reserveEyebrowSlot={reserveEyebrowSlot}
      reserveSubtitleSlot={reserveSubtitleSlot}
      reserveMetaSlot={reserveMetaSlot}
      reserveFooterSlot={reserveFooterSlot}
      metaOverflow={metaOverflow}
      className={className}
      bodyClassName={bodyClassName}
      titleClassName={titleClassName}
      subtitleClassName={subtitleClassName}
      metaClassName={metaClassName}
      footerClassName={footerClassName}
      data-testid={testId}
    />
  );
}
