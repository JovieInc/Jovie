import type { StatusCellTone } from '@/components/organisms/table/cells/StatusCell';
import {
  type AudienceRowState,
  deriveAudienceState,
} from '@/lib/audience/derive-state';
import type { AudienceMember } from '@/types';

export type AudienceDisplayState = AudienceRowState | 'subscriber';

/** Dot tone per state. Status is a dot plus text, never a filled pill. */
export const AUDIENCE_STATE_TONES: Record<
  AudienceDisplayState,
  StatusCellTone
> = {
  high: 'positive',
  rising: 'attention',
  dormant: 'neutral',
  subscriber: 'info',
};

export const AUDIENCE_STATE_LABELS: Record<AudienceDisplayState, string> = {
  high: 'High',
  rising: 'Rising',
  dormant: 'Dormant',
  subscriber: 'Subscriber',
};

/**
 * Format: "+CC ••• LAST4" where CC is 1-3 country-code digits and LAST4 is
 * the last four digits. Anything we cannot confidently parse falls back to
 * the raw input rather than an awkward fabricated layout.
 */
export function maskAudiencePhone(phone: string): string {
  const trimmed = phone.trim();
  const digits = trimmed.replace(/\D/g, '');
  if (digits.length < 7) return trimmed;
  const last4 = digits.slice(-4);
  const hasPlus = trimmed.startsWith('+');
  const ccLen = hasPlus ? Math.min(3, Math.max(0, digits.length - 10)) : 0;
  const cc = ccLen > 0 ? `+${digits.slice(0, ccLen)} ` : '';
  return `${cc}••• ${last4}`;
}

export function getAudienceVisibleEmail(
  member: Pick<AudienceMember, 'email' | 'emailVisibleToArtist'>
): string | null {
  return member.emailVisibleToArtist === true ? member.email : null;
}

export function isAudienceMemberAnonymous(
  member: Pick<
    AudienceMember,
    | 'displayName'
    | 'email'
    | 'emailVisibleToArtist'
    | 'phone'
    | 'spotifyConnected'
  >
): boolean {
  const name = member.displayName?.trim() ?? '';
  const visibleEmail = getAudienceVisibleEmail(member);

  return !name && !visibleEmail && !member.phone && !member.spotifyConnected;
}

export function getAudienceDisplayName(
  member: Pick<
    AudienceMember,
    | 'displayName'
    | 'email'
    | 'emailVisibleToArtist'
    | 'phone'
    | 'spotifyConnected'
  >
): string {
  const name = member.displayName?.trim() ?? '';
  if (name.length > 0) {
    return name;
  }

  return isAudienceMemberAnonymous(member)
    ? 'Anonymous visitor'
    : 'Audience member';
}

/** Whether the artist can message this audience member through a known channel. */
export function canMessageAudienceMember(
  member: Pick<
    AudienceMember,
    | 'displayName'
    | 'email'
    | 'emailVisibleToArtist'
    | 'phone'
    | 'spotifyConnected'
  >
): boolean {
  return (
    !isAudienceMemberAnonymous(member) && isAudienceMemberReachable(member)
  );
}

export function getAudienceIdentityChip(
  member: Pick<AudienceMember, 'email' | 'emailVisibleToArtist' | 'phone'>,
  displayName: string
): string | null {
  const visibleEmail = getAudienceVisibleEmail(member);
  if (visibleEmail && visibleEmail !== displayName) {
    return visibleEmail;
  }
  if (member.phone && member.emailVisibleToArtist === true) {
    return maskAudiencePhone(member.phone);
  }
  return null;
}

function referrerHost(url: string | undefined): string | null {
  if (!url) return null;
  try {
    return new URL(url).hostname.replace(/^www\./, '') || null;
  } catch {
    return null;
  }
}

const DEVICE_LABELS: Record<string, string> = {
  mobile: 'Mobile',
  desktop: 'Desktop',
  tablet: 'Tablet',
};

/**
 * Short descriptor from fields that already exist on the row: place, then
 * referrer source, then device. Gives unnamed visitors something to read
 * ("Anonymous visitor  Los Angeles") instead of a bare label.
 */
export function getAudienceDescriptor(
  member: Pick<
    AudienceMember,
    | 'locationLabel'
    | 'geoCity'
    | 'geoCountry'
    | 'referrerHistory'
    | 'deviceType'
  >
): string | null {
  const place =
    [member.geoCity, member.geoCountry].filter(Boolean).join(', ') ||
    member.locationLabel?.trim();
  if (place && place !== 'Unknown') return place;
  const source = referrerHost(member.referrerHistory?.[0]?.url);
  if (source) return `via ${source}`;
  const device = member.deviceType?.trim().toLowerCase();
  if (device) return DEVICE_LABELS[device] ?? member.deviceType ?? null;
  return null;
}

export function isAudienceMemberReachable(
  member: Pick<AudienceMember, 'email' | 'emailVisibleToArtist' | 'phone'>
): boolean {
  return Boolean(
    getAudienceVisibleEmail(member) ||
      (member.emailVisibleToArtist === true && member.phone)
  );
}

export function getAudienceDisplayState({
  member,
  mode,
  nowMs,
  isSsr,
}: Readonly<{
  member: AudienceMember;
  mode: 'members' | 'subscribers';
  nowMs: number;
  isSsr: boolean;
}>): AudienceDisplayState {
  if (mode === 'subscribers') {
    return 'subscriber';
  }
  if (isSsr) {
    return 'rising';
  }
  return deriveAudienceState(member, nowMs);
}
