export type DeviceIndicator = {
  iconName: string;
  label: string;
};

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

export function formatTimeAgo(value: string | null): string {
  if (!value) return '—';
  const timestamp = new Date(value);
  if (Number.isNaN(timestamp.getTime())) return '—';

  const diff = Date.now() - timestamp.getTime();
  const seconds = Math.floor(diff / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (seconds < 60) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  if (hours < 24) return `${hours}h ago`;
  return `${days}d ago`;
}

export function formatLongDate(value: string | null): string {
  if (!value) return '—';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return '—';
  return new Intl.DateTimeFormat('en', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(parsed);
}

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
