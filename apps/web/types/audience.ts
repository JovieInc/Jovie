export type AudienceMemberType =
  | 'anonymous'
  | 'email'
  | 'sms'
  | 'spotify'
  | 'customer';

export type AudienceIntentLevel = 'high' | 'medium' | 'low';

export type AudienceAction = {
  label: string;
  emoji?: string;
  platform?: string;
  timestamp?: string;
  eventType?: string;
  verb?: string;
  confidence?: string;
  sourceKind?: string;
  sourceLabel?: string;
  sourceLinkId?: string;
  sourceLinkCode?: string;
  objectType?: string;
  objectId?: string;
  objectLabel?: string;
  properties?: Record<string, unknown>;
  context?: Record<string, unknown>;
};

export type AudienceReferrer = { url: string; timestamp?: string };

export type AudienceUtmParams = {
  source?: string;
  medium?: string;
  campaign?: string;
  content?: string;
  term?: string;
};

export type AudienceMember = {
  id: string;
  type: AudienceMemberType;
  displayName: string | null;
  birthday?: string | null;
  locationLabel: string;
  geoCity: string | null;
  geoCountry: string | null;
  visits: number;
  engagementScore: number;
  intentLevel: AudienceIntentLevel;
  latestActions: AudienceAction[];
  referrerHistory: AudienceReferrer[];
  utmParams: AudienceUtmParams;
  email: string | null;
  phone: string | null;
  jovieEmailSubscribed?: boolean;
  artistEmailOptedIn?: boolean;
  artistEmailPendingProvider?: boolean;
  emailVisibleToArtist?: boolean;
  spotifyConnected: boolean;
  purchaseCount: number;
  tipAmountTotalCents: number;
  tipCount: number;
  ltvStreamingClicks?: number;
  ltvTipClickValueCents?: number;
  ltvMerchSalesCents?: number;
  ltvTicketSalesCents?: number;
  tags: string[];
  deviceType: string | null;
  lastSeenAt: string | null;
};

export type AudienceSourceGroup = {
  id: string;
  creatorProfileId: string;
  name: string;
  sourceType: string;
  destinationKind: string;
  destinationId: string | null;
  destinationUrl: string | null;
  utmParams: Record<string, string | undefined>;
  metadata: Record<string, unknown>;
  archivedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type AudienceSourceLink = {
  id: string;
  creatorProfileId: string;
  sourceGroupId: string | null;
  code: string;
  name: string;
  sourceType: string;
  destinationKind: string;
  destinationId: string | null;
  destinationUrl: string;
  utmParams: Record<string, string | undefined>;
  metadata: Record<string, unknown>;
  scanCount: number;
  lastScannedAt: string | null;
  archivedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type {
  AudienceEventSentence,
  AudienceEventSentenceToken,
} from '@/lib/audience/activity-types';
