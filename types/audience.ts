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
};

export type AudienceReferrer = { url: string; timestamp?: string };

export type AudienceMember = {
  id: string;
  type: AudienceMemberType;
  displayName: string | null;
  locationLabel: string;
  geoCity: string | null;
  geoCountry: string | null;
  visits: number;
  engagementScore: number;
  intentLevel: AudienceIntentLevel;
  latestActions: AudienceAction[];
  referrerHistory: AudienceReferrer[];
  email: string | null;
  phone: string | null;
  spotifyConnected: boolean;
  purchaseCount: number;
  tags: string[];
  deviceType: string | null;
  lastSeenAt: string | null;
};
