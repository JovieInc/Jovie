import type { AudienceMemberType } from '@/types';

export type DeviceIndicator = {
  iconName: string;
  label: string;
};

/** Derive a meaningful fallback name from member type instead of generic "Visitor" */
export function getFallbackName(type: AudienceMemberType): string {
  switch (type) {
    case 'email':
      return 'Email Subscriber';
    case 'sms':
      return 'SMS Subscriber';
    case 'spotify':
      return 'Spotify Listener';
    case 'customer':
      return 'Customer';
    default:
      return 'Visitor';
  }
}

export function formatCountryLabel(code: string | null): string {
  if (!code) return 'Unknown';
  const upper = code.slice(0, 2).toUpperCase();
  return /^[A-Z]{2}$/.test(upper) ? upper : 'Unknown';
}

export function flagFromCountry(code: string | null): string {
  if (!code || code.length < 2) return '🏳️';
  const upper = code.slice(0, 2).toUpperCase();
  const first = upper.codePointAt(0);
  const second = upper.codePointAt(1);

  if (!first || !second) return '🏳️';
  if (first < 65 || first > 90 || second < 65 || second > 90) {
    return '🏳️';
  }

  return String.fromCodePoint(0x1f1e6 + (first - 65), 0x1f1e6 + (second - 65));
}

// Re-export date formatting from centralized utility for backwards compatibility
export {
  formatShortDate as formatLongDate,
  formatTimeAgo,
} from '@/lib/utils/date-formatting';

export function getDeviceIndicator(
  deviceType: string | null
): DeviceIndicator | null {
  if (!deviceType) return null;
  const normalized = deviceType.toLowerCase();

  if (
    normalized.includes('mobile') ||
    normalized.includes('phone') ||
    normalized.includes('ios') ||
    normalized.includes('android')
  ) {
    return { iconName: 'Smartphone', label: 'Mobile' };
  }

  if (normalized.includes('tablet') || normalized.includes('ipad')) {
    return { iconName: 'Tablet', label: 'Tablet' };
  }

  if (
    normalized.includes('desktop') ||
    normalized.includes('computer') ||
    normalized.includes('laptop')
  ) {
    return { iconName: 'Monitor', label: 'Desktop' };
  }

  return null;
}
