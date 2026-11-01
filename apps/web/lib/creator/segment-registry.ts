/**
 * Segment-scoped content registry (JOV-9679).
 *
 * Every segment-specific recommendation, feature, CTA, notification template
 * and agent playbook declares `segments: [...]` or `'neutral'`. Selection goes
 * through `selectForSegment`; nothing in-app should render segment language
 * that is not tagged here.
 *
 * Scope semantics:
 * - `'neutral'` applies to every creator, including unknown ones.
 * - `[...]` applies only to the listed segments. An unresolved (neutral)
 *   creator sees none of them. Artist-only features (releases, DSP links,
 *   labels) are therefore hidden for non-artists.
 */
import {
  MUSIC_SEGMENTS,
  NEUTRAL_SEGMENT,
  type ResolvedSegment,
  type Segment,
} from './segments';

export type SegmentScope = readonly Segment[] | 'neutral';

export type RegistryKind =
  | 'recommendation'
  | 'feature'
  | 'cta'
  | 'notification'
  | 'playbook'
  | 'empty_state'
  | 'onboarding_line';

export interface SegmentedItem {
  readonly id: string;
  readonly kind: RegistryKind;
  readonly segments: SegmentScope;
  /** Customer or agent-facing text, when the item carries any. */
  readonly text?: string;
}

const MUSIC = MUSIC_SEGMENTS;
/** Segments that perform live shows. */
const LIVE_PERFORMERS: readonly Segment[] = [
  'musician',
  'dj_producer',
  'comedian',
];

export function appliesToSegment(
  scope: SegmentScope,
  segment: ResolvedSegment
): boolean {
  if (scope === 'neutral') return true;
  return segment !== NEUTRAL_SEGMENT && scope.includes(segment);
}

export function selectForSegment<T extends { readonly segments: SegmentScope }>(
  items: readonly T[],
  segment: ResolvedSegment
): T[] {
  return items.filter(item => appliesToSegment(item.segments, segment));
}

/**
 * Drops items scoped to other segments but keeps `'neutral'` ones. For
 * surfaces that have not resolved a segment yet (a first onboarding turn),
 * `undefined` or an unresolved segment keeps everything: nothing is known to
 * be wrong, and the legacy copy stays until a signal arrives.
 */
export function excludeOtherSegments<
  T extends { readonly segments?: SegmentScope },
>(items: readonly T[], segment: ResolvedSegment | undefined): T[] {
  if (!segment || segment === NEUTRAL_SEGMENT) return [...items];
  return items.filter(
    item => !item.segments || appliesToSegment(item.segments, segment)
  );
}

// ---------------------------------------------------------------------------
// Features. Visibility follows the no-dead-ends rule: hidden, not disabled.
// ---------------------------------------------------------------------------
export const FEATURES = [
  { id: 'releases', kind: 'feature', segments: MUSIC },
  { id: 'dsp_links', kind: 'feature', segments: MUSIC },
  { id: 'release_notifications', kind: 'feature', segments: MUSIC },
  { id: 'album_art', kind: 'feature', segments: MUSIC },
  { id: 'release_pitching', kind: 'feature', segments: MUSIC },
  { id: 'label_tools', kind: 'feature', segments: MUSIC },
  { id: 'tour_dates', kind: 'feature', segments: LIVE_PERFORMERS },
  { id: 'profile', kind: 'feature', segments: 'neutral' },
  { id: 'audience_signals', kind: 'feature', segments: 'neutral' },
  { id: 'tips', kind: 'feature', segments: 'neutral' },
] as const satisfies readonly SegmentedItem[];

export type FeatureId = (typeof FEATURES)[number]['id'];

export function isFeatureVisible(
  featureId: FeatureId,
  segment: ResolvedSegment
): boolean {
  const feature = FEATURES.find(f => f.id === featureId);
  return feature ? appliesToSegment(feature.segments, segment) : false;
}

/** Chat starter actions map to the feature they depend on. */
export const STARTER_ACTION_FEATURE: Record<string, FeatureId> = {
  'plan-release': 'releases',
  'generate-album-art': 'album_art',
  'build-artist-profile': 'profile',
  'review-signals': 'audience_signals',
};

// ---------------------------------------------------------------------------
// Insight -> next-step actions (chat empty state).
// ---------------------------------------------------------------------------
export const INSIGHT_ACTIONS: readonly (SegmentedItem & {
  readonly insightType: string;
})[] = [
  {
    id: 'release_momentum',
    insightType: 'release_momentum',
    kind: 'recommendation',
    segments: MUSIC,
    text: 'Draft a release update',
  },
  {
    id: 'subscriber_surge',
    insightType: 'subscriber_surge',
    kind: 'recommendation',
    segments: 'neutral',
    text: 'Draft an update for your audience',
  },
  {
    id: 'subscriber_churn',
    insightType: 'subscriber_churn',
    kind: 'recommendation',
    segments: 'neutral',
    text: 'Draft an update for your audience',
  },
  {
    id: 'tip_hotspot',
    insightType: 'tip_hotspot',
    kind: 'recommendation',
    segments: 'neutral',
    text: 'Review your tip flow with Jovie',
  },
  {
    id: 'capture_rate_change',
    insightType: 'capture_rate_change',
    kind: 'recommendation',
    segments: 'neutral',
    text: 'Review your signup flow with Jovie',
  },
  {
    id: 'city_growth',
    insightType: 'city_growth',
    kind: 'recommendation',
    segments: LIVE_PERFORMERS,
    text: 'Plan your next show',
  },
  {
    id: 'new_market',
    insightType: 'new_market',
    kind: 'recommendation',
    segments: LIVE_PERFORMERS,
    text: 'Plan your next show',
  },
  {
    id: 'declining_market',
    insightType: 'declining_market',
    kind: 'recommendation',
    segments: LIVE_PERFORMERS,
    text: 'Plan your next show',
  },
  {
    id: 'tour_gap',
    insightType: 'tour_gap',
    kind: 'recommendation',
    segments: LIVE_PERFORMERS,
    text: 'Plan your next show',
  },
  {
    id: 'tour_timing',
    insightType: 'tour_timing',
    kind: 'recommendation',
    segments: LIVE_PERFORMERS,
    text: 'Plan your next show',
  },
  {
    id: 'platform_preference',
    insightType: 'platform_preference',
    kind: 'recommendation',
    segments: 'neutral',
    text: 'Review your traffic sources',
  },
  {
    id: 'referrer_surge',
    insightType: 'referrer_surge',
    kind: 'recommendation',
    segments: 'neutral',
    text: 'Review your traffic sources',
  },
  {
    id: 'engagement_quality',
    insightType: 'engagement_quality',
    kind: 'recommendation',
    segments: 'neutral',
    text: 'Plan your next update',
  },
  {
    id: 'peak_activity',
    insightType: 'peak_activity',
    kind: 'recommendation',
    segments: 'neutral',
    text: 'Plan when to share your next update',
  },
  {
    id: 'device_shift',
    insightType: 'device_shift',
    kind: 'recommendation',
    segments: 'neutral',
    text: 'Review your audience experience',
  },
];

// ---------------------------------------------------------------------------
// Notification templates.
// ---------------------------------------------------------------------------
export const NOTIFICATION_TEMPLATES = [
  { id: 'release_day_sms', kind: 'notification', segments: MUSIC },
  { id: 'release_preview', kind: 'notification', segments: MUSIC },
  { id: 'new_release_detected', kind: 'notification', segments: MUSIC },
  { id: 'dsp_match_suggested', kind: 'notification', segments: MUSIC },
  { id: 'social_link_suggested', kind: 'notification', segments: 'neutral' },
  { id: 'enrichment_complete', kind: 'notification', segments: 'neutral' },
] as const satisfies readonly SegmentedItem[];

export type NotificationTemplateId =
  (typeof NOTIFICATION_TEMPLATES)[number]['id'];

export function canSendNotification(
  templateId: NotificationTemplateId,
  segment: ResolvedSegment
): boolean {
  const template = NOTIFICATION_TEMPLATES.find(t => t.id === templateId);
  return template ? appliesToSegment(template.segments, segment) : false;
}

// ---------------------------------------------------------------------------
// Agent playbooks: the segment guidance injected into the agent system prompt.
// ---------------------------------------------------------------------------
export const AGENT_PLAYBOOKS: readonly SegmentedItem[] = [
  {
    id: 'neutral_creator',
    kind: 'playbook',
    segments: 'neutral',
    text: 'Use language that fits any creator: profile, audience, updates, links, work. Do not assume what they make. Ask what they make before giving craft-specific advice.',
  },
  {
    id: 'music_release_cadence',
    kind: 'playbook',
    segments: MUSIC,
    text: 'Release strategy: pick a release date, announce it, and send a pre-save push. Friday is the standard release day for singles.',
  },
  {
    id: 'music_playlist_pitching',
    kind: 'playbook',
    segments: ['musician'],
    text: 'Pitch new releases to playlist curators and press before release day.',
  },
  {
    id: 'dj_sets_and_mixes',
    kind: 'playbook',
    segments: ['dj_producer'],
    text: 'Post mixes and set recordings, keep residency and gig dates current, and link the next booking.',
  },
  {
    id: 'comedian_shows',
    kind: 'playbook',
    segments: ['comedian'],
    text: 'Promote the next show date, post clips from sets, and keep the ticket link current. Lead with a clip, not a bio.',
  },
  {
    id: 'athlete_season',
    kind: 'playbook',
    segments: ['athlete'],
    text: 'Share training and competition updates, sponsor links, and the next event on your calendar.',
  },
  {
    id: 'actor_credits',
    kind: 'playbook',
    segments: ['actor_model'],
    text: 'Keep the reel, credits and booking contact current, and share casting or release news when it is public.',
  },
  {
    id: 'podcaster_episodes',
    kind: 'playbook',
    segments: ['podcaster'],
    text: 'Promote new episodes, link every listening app, and clip one moment per episode.',
  },
  {
    id: 'streamer_schedule',
    kind: 'playbook',
    segments: ['streamer'],
    text: 'Keep the stream schedule and channel links current, and post a highlight clip after big streams.',
  },
  {
    id: 'writer_work',
    kind: 'playbook',
    segments: ['writer'],
    text: 'Link the latest piece, the newsletter signup, and the next publication date.',
  },
];

/** Playbook text for the agent prompt. Always safe for the given segment. */
export function playbookTextForSegment(segment: ResolvedSegment): string[] {
  return selectForSegment(AGENT_PLAYBOOKS, segment)
    .map(p => p.text)
    .filter((t): t is string => Boolean(t));
}

/**
 * Prompt section stating who the agent is talking to. Another segment's
 * playbook never appears here, and the rule below tells the model not to
 * borrow one.
 */
export function buildSegmentPromptSection(segment: ResolvedSegment): string {
  const identity =
    segment === NEUTRAL_SEGMENT
      ? 'The creator type is unknown.'
      : `The creator is a ${segment.replace('_', ' / ')}.`;
  const lines = playbookTextForSegment(segment)
    .map(text => `Playbook: ${text}`)
    .join('\n');
  return `## Creator Segment
${identity} Give advice, features and vocabulary that fit only this segment. Never offer another creator type's advice, or any feature not listed for them.
${lines}`;
}

// ---------------------------------------------------------------------------
// Onboarding script lines and empty states are tagged where they are defined
// (see onboarding-script/script.ts) using the same SegmentScope.
// ---------------------------------------------------------------------------
export const ALL_REGISTRY_ITEMS: readonly SegmentedItem[] = [
  ...FEATURES,
  ...INSIGHT_ACTIONS,
  ...NOTIFICATION_TEMPLATES,
  ...AGENT_PLAYBOOKS,
];

/**
 * Words that belong to one segment's world. Used by the eval fixtures and the
 * in-app invariant: a term in segment A's list may not appear in content
 * selected for segment B unless B's list also contains it.
 */
export const SEGMENT_TERMS: Record<Segment, readonly string[]> = {
  musician: [
    'release day',
    'pre-save',
    'playlist',
    'record label',
    'single',
    'album',
    'dsp',
    'spotify',
    'streams',
  ],
  dj_producer: [
    'mixes',
    'residency',
    'gig',
    'set recordings',
    'release day',
    'pre-save',
    'record label',
    'single',
    'dsp',
    'streams',
  ],
  comedian: ['ticket link', 'clips from sets', 'open mic', 'special'],
  athlete: ['training', 'competition', 'sponsor', 'event on your calendar'],
  actor_model: ['reel', 'credits', 'casting', 'booking contact'],
  podcaster: ['episode', 'listening app'],
  streamer: ['stream schedule', 'highlight clip', 'channel links'],
  writer: ['newsletter', 'publication date', 'latest piece'],
  other: [],
};

/** Cross-segment terms found in `text` for `segment`. Empty means clean. */
export function crossSegmentTerms(
  text: string,
  segment: ResolvedSegment
): string[] {
  const lower = text.toLowerCase();
  const own = new Set(
    segment === NEUTRAL_SEGMENT ? [] : SEGMENT_TERMS[segment]
  );
  const found = new Set<string>();
  for (const [seg, terms] of Object.entries(SEGMENT_TERMS)) {
    if (seg === segment) continue;
    for (const term of terms) {
      if (!own.has(term) && lower.includes(term)) found.add(term);
    }
  }
  return [...found];
}
