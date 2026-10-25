import { SIDEBAR_WIDTH } from '@/lib/constants/layout';

/**
 * EntityRail configuration — the canonical entity-type table for the ONE
 * right-rail template (Tim, 2026-10-25: "right rail chaos and IA differences
 * between screens is a massive lever").
 *
 * Structural rules enforced by EntityRail.test.tsx:
 * - every entity type lists exactly 3 key stats;
 * - the first tab is always `Overview`;
 * - tab ids are stable and equal to their labels lowercased.
 *
 * Stats whose source does not exist yet render "Not measured" until wired —
 * that is the point of the rule, and each is a metric to add.
 */

/** One fixed rail width on >= lg; `wide` (documents) is the only variant. */
export const RAIL_WIDTH = SIDEBAR_WIDTH;
export const RAIL_WIDTH_WIDE = 480;

export type EntityRailEntityType =
  | 'release'
  | 'track'
  | 'work'
  | 'contact'
  | 'fan'
  | 'artist-profile'
  | 'link'
  | 'tour-date'
  | 'task'
  | 'dsp-match'
  | 'pull-request'
  | 'agent'
  | 'certification'
  | 'cost-line';

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
  /** One noun, one label, sentence case. */
  readonly label: string;
  /** Ordered tabs; the first tab is always Overview. */
  readonly tabs: readonly EntityRailTab[];
  /** Exactly 3 key stats, ordered. */
  readonly stats: readonly [EntityRailStat, EntityRailStat, EntityRailStat];
}

const tabs = (labels: readonly string[]): readonly EntityRailTab[] =>
  labels.map(label => ({ id: label.toLowerCase(), label }));

const stats = (
  entries: readonly [
    readonly [string, string],
    readonly [string, string],
    readonly [string, string],
  ]
): readonly [EntityRailStat, EntityRailStat, EntityRailStat] =>
  entries.map(([label, measuredBy]) => ({ label, measuredBy })) as [
    EntityRailStat,
    EntityRailStat,
    EntityRailStat,
  ];

export const ENTITY_RAIL_ENTITY_TABLE: Readonly<
  Record<EntityRailEntityType, EntityRailEntityConfig>
> = {
  release: {
    label: 'Release',
    tabs: tabs(['Overview', 'Links', 'Activity', 'Tasks']),
    stats: stats([
      ['Total clicks', 'smart-link analytics'],
      ['Last click', 'smart-link analytics'],
      ['Streams', 'streaming ingestion'],
    ]),
  },
  track: {
    label: 'Track',
    tabs: tabs(['Overview', 'Assets', 'Links', 'Rights']),
    stats: stats([
      ['Plays', 'streaming ingestion'],
      ['Link clicks', 'smart-link analytics'],
      ['Duration', 'catalog metadata'],
    ]),
  },
  work: {
    label: 'Work',
    tabs: tabs(['Overview', 'Files', 'Activity']),
    stats: stats([
      ['Files', 'library assets'],
      ['Size', 'library assets'],
      ['Last edited', 'library assets'],
    ]),
  },
  contact: {
    label: 'Contact',
    tabs: tabs(['Overview', 'Activity', 'Tasks']),
    stats: stats([
      ['Last contact', 'engagement events'],
      ['Open tasks', 'tasks'],
      ['Territories', 'profile facts'],
    ]),
  },
  fan: {
    label: 'Fan',
    tabs: tabs(['Overview', 'Activity', 'Sources']),
    stats: stats([
      ['Visits', 'profile analytics'],
      ['Link clicks', 'smart-link analytics'],
      ['Last seen', 'profile analytics'],
    ]),
  },
  'artist-profile': {
    label: 'Artist profile',
    tabs: tabs(['Overview', 'Links', 'Music', 'Activity']),
    stats: stats([
      ['Profile views', 'profile analytics'],
      ['Link clicks', 'smart-link analytics'],
      ['Subscribers', 'fan capture'],
    ]),
  },
  link: {
    label: 'Link',
    tabs: tabs(['Overview', 'Activity']),
    stats: stats([
      ['Clicks', 'smart-link analytics'],
      ['Last click', 'smart-link analytics'],
      ['Top source', 'referrer analytics'],
    ]),
  },
  'tour-date': {
    label: 'Tour date',
    tabs: tabs(['Overview', 'Activity']),
    stats: stats([
      ['Tickets clicks', 'smart-link analytics'],
      ['Views', 'profile analytics'],
      ['Days to show', 'calendar events'],
    ]),
  },
  task: {
    label: 'Task',
    tabs: tabs(['Overview', 'Activity']),
    stats: stats([
      ['Status age', 'tasks'],
      ['Owner', 'tasks'],
      ['Due', 'tasks'],
    ]),
  },
  'dsp-match': {
    label: 'DSP match',
    tabs: tabs(['Overview', 'Links']),
    stats: stats([
      ['Confidence', 'DSP matching'],
      ['Status', 'DSP matching'],
      ['Last checked', 'DSP matching'],
    ]),
  },
  'pull-request': {
    label: 'Pull request',
    tabs: tabs(['Overview', 'Checks', 'Activity']),
    stats: stats([
      ['Stage age', 'merge queue'],
      ['Checks', 'CI'],
      ['Queue position', 'merge queue'],
    ]),
  },
  agent: {
    label: 'Agent',
    tabs: tabs(['Overview', 'Runs', 'Activity']),
    stats: stats([
      ['Runs 24h', 'agent mesh'],
      ['Success rate', 'agent mesh'],
      ['Last heartbeat', 'agent mesh'],
    ]),
  },
  certification: {
    label: 'Certification',
    tabs: tabs(['Overview', 'Evidence', 'Activity']),
    stats: stats([
      ['Blockers', 'review registry'],
      ['Review state', 'review registry'],
      ['Age', 'review registry'],
    ]),
  },
  'cost-line': {
    label: 'Cost line',
    tabs: tabs(['Overview', 'Activity']),
    stats: stats([
      ['Spend 30d', 'cost ledger'],
      ['Runway', 'cost ledger'],
      ['Cap used', 'cost ledger'],
    ]),
  },
};

export const ENTITY_RAIL_OVERVIEW_TAB_ID = 'overview';

export function getEntityRailConfig(
  entityType: EntityRailEntityType
): EntityRailEntityConfig {
  return ENTITY_RAIL_ENTITY_TABLE[entityType];
}
