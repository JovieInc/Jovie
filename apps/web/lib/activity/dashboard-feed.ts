export const DASHBOARD_ACTIVITY_TYPES = [
  'click',
  'visit',
  'subscribe',
  'unknown',
] as const;

export type DashboardActivityType = (typeof DASHBOARD_ACTIVITY_TYPES)[number];

export const DASHBOARD_ACTIVITY_ICONS = [
  'listen',
  'social',
  'tip',
  'link',
  'visit',
  'sms',
  'email',
] as const;

export type DashboardActivityIcon = (typeof DASHBOARD_ACTIVITY_ICONS)[number];

export interface DashboardActivity {
  id: string;
  type: DashboardActivityType;
  description: string;
  icon: DashboardActivityIcon;
  timestamp: string;
  href?: string;
}

const LEGACY_ICON_MAP: Record<string, DashboardActivityIcon> = {
  '🎧': 'listen',
  '📸': 'social',
  '💸': 'tip',
  '🔗': 'link',
  '✨': 'link',
  '👀': 'visit',
  '📱': 'sms',
  '📩': 'email',
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function normalizeDashboardActivityType(
  value: unknown
): DashboardActivityType {
  if (
    typeof value === 'string' &&
    DASHBOARD_ACTIVITY_TYPES.includes(value as DashboardActivityType)
  ) {
    return value as DashboardActivityType;
  }

  return 'unknown';
}

export function normalizeDashboardActivityIcon(
  value: unknown
): DashboardActivityIcon {
  if (typeof value !== 'string') {
    return 'link';
  }

  const legacyIcon = LEGACY_ICON_MAP[value];
  if (legacyIcon) {
    return legacyIcon;
  }

  if (DASHBOARD_ACTIVITY_ICONS.includes(value as DashboardActivityIcon)) {
    return value as DashboardActivityIcon;
  }

  return 'link';
}

export function coerceDashboardActivity(
  value: unknown
): DashboardActivity | null {
  if (!isRecord(value)) {
    return null;
  }

  const id = value.id;
  const description = value.description;
  const timestamp = value.timestamp;

  if (
    typeof id !== 'string' ||
    typeof description !== 'string' ||
    typeof timestamp !== 'string'
  ) {
    return null;
  }

  const href = typeof value.href === 'string' ? value.href : undefined;

  return {
    id,
    type: normalizeDashboardActivityType(value.type),
    description,
    icon: normalizeDashboardActivityIcon(value.icon),
    timestamp,
    href,
  };
}

export function parseDashboardActivityFeedResponse(
  value: unknown
): DashboardActivity[] {
  if (!isRecord(value)) {
    return [];
  }

  const activities = value.activities;
  if (!Array.isArray(activities)) {
    return [];
  }

  return activities
    .map(activity => coerceDashboardActivity(activity))
    .filter((activity): activity is DashboardActivity => activity !== null);
}
