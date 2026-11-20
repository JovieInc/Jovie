import { SIDEBAR_WIDTH } from '@/lib/constants/layout';

/** One fixed rail width on >= lg; `wide` (documents) is the only variant. */
export const RAIL_WIDTH = SIDEBAR_WIDTH;
export const RAIL_WIDTH_WIDE = 480;

export interface EntityRailTab {
  /** Stable tab id: the label lowercased. */
  readonly id: string;
  readonly label: string;
}

export interface EntityRailStat {
  readonly label: string;
  /** Names the source that measures this stat (surfaced when not measured). */
  readonly measuredBy: string;
}

export interface EntityRailEntityConfig {
  readonly label: string;
  /** Ordered tabs; the first tab is always Overview. */
  readonly tabs: readonly EntityRailTab[];
  /** Exactly 3 key stats, ordered. */
  readonly stats: readonly [EntityRailStat, EntityRailStat, EntityRailStat];
}

function entity(
  label: string,
  tabLabels: readonly string[],
  ...entries: readonly [
    readonly [string, string],
    readonly [string, string],
    readonly [string, string],
  ]
): EntityRailEntityConfig {
  const stat = ([label, measuredBy]: readonly [
    string,
    string,
  ]): EntityRailStat => ({ label, measuredBy });
  return {
    label,
    tabs: tabLabels.map(label => ({ id: label.toLowerCase(), label })),
    stats: [stat(entries[0]), stat(entries[1]), stat(entries[2])],
  };
}

export const ENTITY_RAIL_ENTITY_TABLE = {
  release: entity(
    'Release',
    ['Overview', 'Links', 'Activity', 'Tasks'],
    ['Total clicks', 'smart-link analytics'],
    ['Last click', 'smart-link analytics'],
    ['Streams', 'streaming ingestion']
  ),
  track: entity(
    'Track',
    ['Overview', 'Assets', 'Links', 'Rights'],
    ['Plays', 'streaming ingestion'],
    ['Link clicks', 'smart-link analytics'],
    ['Duration', 'catalog metadata']
  ),
  work: entity(
    'Work',
    ['Overview', 'Files', 'Activity'],
    ['Files', 'library assets'],
    ['Size', 'library assets'],
    ['Last edited', 'library assets']
  ),
  contact: entity(
    'Contact',
    ['Overview', 'Activity', 'Tasks'],
    ['Last contact', 'engagement events'],
    ['Open tasks', 'tasks'],
    ['Territories', 'profile facts']
  ),
  fan: entity(
    'Fan',
    ['Overview', 'Activity', 'Sources'],
    ['Visits', 'profile analytics'],
    ['Link clicks', 'smart-link analytics'],
    ['Last seen', 'profile analytics']
  ),
  'artist-profile': entity(
    'Artist profile',
    ['Overview', 'Links', 'Music', 'Activity'],
    ['Profile views', 'profile analytics'],
    ['Link clicks', 'smart-link analytics'],
    ['Subscribers', 'fan capture']
  ),
  link: entity(
    'Link',
    ['Overview', 'Activity'],
    ['Clicks', 'smart-link analytics'],
    ['Last click', 'smart-link analytics'],
    ['Top source', 'referrer analytics']
  ),
  'tour-date': entity(
    'Tour date',
    ['Overview', 'Activity'],
    ['Tickets clicks', 'smart-link analytics'],
    ['Views', 'profile analytics'],
    ['Days to show', 'calendar events']
  ),
  task: entity(
    'Task',
    ['Overview', 'Activity'],
    ['Status age', 'tasks'],
    ['Owner', 'tasks'],
    ['Due', 'tasks']
  ),
  'dsp-match': entity(
    'DSP match',
    ['Overview', 'Links'],
    ['Confidence', 'DSP matching'],
    ['Status', 'DSP matching'],
    ['Last checked', 'DSP matching']
  ),
  'pull-request': entity(
    'Pull request',
    ['Overview', 'Checks', 'Activity'],
    ['Stage age', 'merge queue'],
    ['Checks', 'CI'],
    ['Queue position', 'merge queue']
  ),
  agent: entity(
    'Agent',
    ['Overview', 'Runs', 'Activity'],
    ['Runs 24h', 'agent mesh'],
    ['Success rate', 'agent mesh'],
    ['Last heartbeat', 'agent mesh']
  ),
  certification: entity(
    'Certification',
    ['Overview', 'Evidence', 'Activity'],
    ['Blockers', 'review registry'],
    ['Review state', 'review registry'],
    ['Age', 'review registry']
  ),
  'cost-line': entity(
    'Cost line',
    ['Overview', 'Activity'],
    ['Spend 30d', 'cost ledger'],
    ['Runway', 'cost ledger'],
    ['Cap used', 'cost ledger']
  ),
} as const;

export type EntityRailEntityType = keyof typeof ENTITY_RAIL_ENTITY_TABLE;

export const ENTITY_RAIL_OVERVIEW_TAB_ID = 'overview';

export function getEntityRailConfig(
  entityType: EntityRailEntityType
): EntityRailEntityConfig {
  return ENTITY_RAIL_ENTITY_TABLE[entityType];
}
