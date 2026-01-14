import { capitalize } from '@/lib/utils/csv';

/**
 * Empty value placeholder text
 */
export const EMPTY_VALUE_FALLBACK = '—';

/**
 * Format device type label with proper capitalization
 */
export function formatDeviceTypeLabel(deviceType: string): string {
  const normalized = deviceType.trim();
  if (normalized.length === 0) return deviceType;

  const lower = normalized.toLowerCase();
  if (lower === 'desktop') return 'Desktop';
  if (lower === 'mobile') return 'Mobile';
  if (lower === 'tablet') return 'Tablet';

  const isSimpleLowercaseWord = /^[a-z]+$/.test(normalized);
  if (!isSimpleLowercaseWord) return normalized;

  return capitalize(normalized);
}

/**
 * Format action label with proper capitalization
 */
export function formatActionLabel(label: string): string {
  const normalized = label.trim();
  if (normalized.length === 0) return label;

  return capitalize(normalized);
}

/**
 * Resolve icon name for audience action
 */
export function resolveAudienceActionIcon(label: string): string {
  const normalized = label.trim().toLowerCase();
  if (normalized.includes('visit')) return 'Eye';
  if (normalized.includes('view')) return 'Eye';
  if (normalized.includes('tip')) return 'HandCoins';
  if (normalized.includes('purchase')) return 'CreditCard';
  if (normalized.includes('subscribe')) return 'Bell';
  if (normalized.includes('follow')) return 'UserPlus';
  if (normalized.includes('click')) return 'MousePointerClick';
  if (normalized.includes('link')) return 'Link';
  return 'Sparkles';
}

/**
 * Compute display title for audience member
 */
export function computeMemberTitle(
  member: {
    type: string;
    displayName?: string | null;
    email?: string | null;
    phone?: string | null;
  } | null
): string {
  if (!member || member.type === 'anonymous') {
    return 'Anonymous user';
  }
  return member.displayName || member.email || member.phone || 'Visitor';
}

/**
 * Compute display subtitle for audience member
 */
export function computeMemberSubtitle(
  member: { type: string; email?: string | null; phone?: string | null } | null
): string {
  if (!member || member.type === 'anonymous') {
    return 'Visitor';
  }

  switch (member.type) {
    case 'email':
      return member.email ?? 'Email fan';
    case 'sms':
      return member.phone ?? 'SMS fan';
    case 'spotify':
      return 'Spotify connected';
    case 'customer':
      return 'Customer';
    default:
      return 'Visitor';
  }
}

/**
 * Compute avatar source for audience member
 */
export function computeMemberAvatarSrc(
  member: { type: string } | null
): string | null {
  return !member || member.type === 'anonymous'
    ? '/avatars/default-user.png'
    : null;
}

/**
 * Compute avatar name for audience member
 */
export function computeMemberAvatarName(
  member: { type: string; id?: string } | null,
  title: string
): string {
  if (!member || member.type === 'anonymous') {
    return 'Anonymous user';
  }
  return title || member.id || 'Audience member';
}
