import type { ContactRole } from '@/types/contacts';

export const CONTACT_ROLE_OPTIONS: Array<{
  value: ContactRole;
  label: string;
  subjectTemplate?: string;
}> = [
  {
    value: 'bookings',
    label: 'Bookings / Touring',
    subjectTemplate: 'Booking - {artist}',
  },
  {
    value: 'management',
    label: 'Management',
    subjectTemplate: 'Management - {artist}',
  },
  {
    value: 'press_pr',
    label: 'Press / PR',
    subjectTemplate: 'Press - {artist}',
  },
  { value: 'brand_partnerships', label: 'Brand partnerships' },
  { value: 'fan_general', label: 'Fan contact / General' },
  { value: 'other', label: 'Other' },
];

export const CONTACT_TERRITORY_PRESETS: string[] = [
  'Worldwide',
  'North America',
  'USA',
  'Canada',
  'UK',
  'Europe (ex-UK)',
  'Latin America',
  'Asia',
  'Australia & New Zealand',
  'Middle East & North Africa',
  'Africa',
];

export function getContactRoleLabel(
  role: ContactRole,
  customLabel?: string | null
): string {
  if (role === 'other' && customLabel) {
    return customLabel;
  }

  const match = CONTACT_ROLE_OPTIONS.find(option => option.value === role);
  return match?.label ?? role;
}

export function buildRoleSubject(
  role: ContactRole,
  artistName: string
): string | undefined {
  const template = CONTACT_ROLE_OPTIONS.find(
    option => option.value === role
  )?.subjectTemplate;
  if (!template) return undefined;
  return template.replace('{artist}', artistName);
}

export function summarizeTerritories(territories: string[]): {
  summary: string;
  count: number;
} {
  if (!territories || territories.length === 0) {
    return { summary: 'General', count: 0 };
  }

  const unique = territories.filter(Boolean);
  if (unique.length === 0) {
    return { summary: 'General', count: 0 };
  }

  const first = unique[0];
  if (unique.length === 1) {
    return { summary: first, count: 1 };
  }

  return { summary: `${first} +${unique.length - 1}`, count: unique.length };
}
