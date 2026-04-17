import type {
  AudienceEventType,
  AudienceObjectType,
} from '@/lib/audience/activity-types';

interface AudienceClickMetadata {
  readonly contentType?: string;
}

function asAudienceClickMetadata(metadata: unknown): AudienceClickMetadata {
  if (metadata && typeof metadata === 'object') {
    return metadata as AudienceClickMetadata;
  }

  return {};
}

export function resolveAudienceClickEventType(
  linkType: string,
  metadata: unknown
): AudienceEventType {
  const record = asAudienceClickMetadata(metadata);

  if (linkType === 'tip') return 'tip_link_opened';
  if (record.contentType === 'tour_date') return 'tour_date_checked_out';
  if (linkType === 'listen' || record.contentType === 'release') {
    return 'content_checked_out';
  }
  if (linkType === 'social') return 'social_opened';
  return 'link_clicked';
}

export function resolveAudienceClickObjectType(
  linkType: string,
  metadata: unknown
): AudienceObjectType {
  const record = asAudienceClickMetadata(metadata);

  if (record.contentType === 'tour_date') return 'tour_date';
  if (record.contentType === 'release') return 'release';
  if (record.contentType === 'track') return 'track';
  if (linkType === 'tip') return 'payment_link';
  if (linkType === 'social') return 'social_link';
  return 'external_url';
}

export function resolveAudienceClickVerb(linkType: string): string {
  if (linkType === 'tip' || linkType === 'social') return 'opened';
  if (linkType === 'listen') return 'checked_out';
  return 'clicked';
}
