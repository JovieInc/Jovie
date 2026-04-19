export type AudienceEventType =
  | 'profile_visited'
  | 'source_scanned'
  | 'link_clicked'
  | 'content_checked_out'
  | 'tour_date_checked_out'
  | 'date_saved'
  | 'subscription_created'
  | 'social_opened'
  | 'tip_link_opened'
  | 'tip_sent'
  | 'legacy';

export type AudienceEventConfidence =
  | 'observed'
  | 'verified'
  | 'inferred'
  | 'legacy';

export type AudienceSourceType =
  | 'qr'
  | 'short_link'
  | 'utm'
  | 'referrer'
  | 'social'
  | 'email'
  | 'sms'
  | 'direct'
  | 'unknown';

export type AudienceObjectType =
  | 'profile'
  | 'release'
  | 'track'
  | 'tour_date'
  | 'social_link'
  | 'payment_link'
  | 'external_url'
  | 'unknown';

export type AudienceEventSentenceToken = {
  kind: 'actor' | 'verb' | 'source' | 'object' | 'platform' | 'time';
  label: string;
};

export type AudienceEventSentence =
  | { kind: 'empty' }
  | {
      kind: 'sentence';
      icon: string;
      text: string;
      tokens: AudienceEventSentenceToken[];
    };

export type AudienceEventInput = {
  label?: string | null;
  eventType?: string | null;
  verb?: string | null;
  confidence?: string | null;
  sourceKind?: string | null;
  sourceLabel?: string | null;
  objectType?: string | null;
  objectId?: string | null;
  objectLabel?: string | null;
  platform?: string | null;
  timestamp?: string | Date | null;
  properties?: Record<string, unknown> | null;
  context?: Record<string, unknown> | null;
};
