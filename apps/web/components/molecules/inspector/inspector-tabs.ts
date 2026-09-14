export const INSPECTOR_TAB_IDS = [
  'details',
  'assets',
  'links',
  'rights',
] as const;

export type InspectorTabId = (typeof INSPECTOR_TAB_IDS)[number];

export const INSPECTOR_TAB_OPTIONS = [
  { value: 'details', label: 'Details' },
  { value: 'assets', label: 'Assets' },
  { value: 'links', label: 'Links' },
  { value: 'rights', label: 'Rights' },
] as const satisfies ReadonlyArray<{
  readonly value: InspectorTabId;
  readonly label: string;
}>;

/**
 * Canonical Library / track inspector tabs.
 *
 * Presence stays out of this set on purpose: artist Presence task feeds
 * belong on Presence/Tasks/Inbox, not inside an object Inspector.
 */
export const LIBRARY_INSPECTOR_TABS = INSPECTOR_TAB_OPTIONS;
