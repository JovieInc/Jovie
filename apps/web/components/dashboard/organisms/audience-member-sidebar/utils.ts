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

  return `${normalized.charAt(0).toUpperCase()}${normalized.slice(1)}`;
}

/**
 * Format action label with proper capitalization
 */
export function formatActionLabel(label: string): string {
  const normalized = label.trim();
  if (normalized.length === 0) return label;

  return `${normalized.charAt(0).toUpperCase()}${normalized.slice(1)}`;
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
