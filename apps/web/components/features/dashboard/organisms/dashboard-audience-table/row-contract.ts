import {
  type AudienceRowState,
  deriveAudienceState,
} from '@/lib/audience/derive-state';
import type { AudienceMember } from '@/types';

export type AudienceDisplayState = AudienceRowState | 'subscriber';

export const AUDIENCE_STATE_STYLES: Record<AudienceDisplayState, string> = {
  high: 'bg-emerald-500/15 text-emerald-300 ring-emerald-500/25',
  rising: 'bg-amber-500/15 text-amber-300 ring-amber-500/25',
  dormant: 'bg-surface-0 text-tertiary-token ring-subtle',
  subscriber: 'bg-violet-500/15 text-violet-200 ring-violet-500/25',
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
  return member.emailVisibleToArtist === false ? null : member.email;
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

  return isAudienceMemberAnonymous(member) ? 'Anonymous Fan' : 'Visitor';
}

export function getAudienceIdentityChip(
  member: Pick<AudienceMember, 'email' | 'emailVisibleToArtist' | 'phone'>,
  displayName: string
): string | null {
  const visibleEmail = getAudienceVisibleEmail(member);
  if (visibleEmail && visibleEmail !== displayName) {
    return visibleEmail;
  }
  if (member.phone) {
    return maskAudiencePhone(member.phone);
  }
  return null;
}

export function isAudienceMemberReachable(
  member: Pick<AudienceMember, 'email' | 'emailVisibleToArtist' | 'phone'>
): boolean {
  return Boolean(getAudienceVisibleEmail(member) || member.phone);
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
