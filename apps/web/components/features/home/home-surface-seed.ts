/**
 * Homepage proof asset type. References screenshot scenarios by ID only.
 * Derive src and viewport from SCREENSHOT_SCENARIOS (single source of truth).
 */
export interface HomepageProofAsset {
  readonly id: string;
  readonly scenarioId: string;
  readonly alt: string;
  readonly kind: 'phone' | 'desktop' | 'crop';
}

/**
 * Homepage proof manifest. Every proof slot maps to a registered screenshot scenario.
 * The manifest-to-registry test validates that all scenarioIds exist.
 */
export const HOMEPAGE_PROOF_ASSETS: readonly HomepageProofAsset[] = [
  {
    id: 'hero-profile',
    scenarioId: 'public-profile-mobile',
    alt: 'Tim White artist profile on Jovie',
    kind: 'phone',
  },
  {
    id: 'release-presave',
    scenarioId: 'release-presave-mobile',
    alt: 'The Deep End presave countdown on Jovie',
    kind: 'phone',
  },
  {
    id: 'release-live',
    scenarioId: 'release-landing-mobile',
    alt: 'Take Me Over live smart link on Jovie',
    kind: 'phone',
  },
  {
    id: 'bento-tasks',
    scenarioId: 'release-tasks-desktop',
    alt: 'Release tasks dashboard in Jovie',
    kind: 'crop',
  },
  {
    id: 'bento-releases',
    scenarioId: 'dashboard-releases-sidebar-desktop',
    alt: 'Releases dashboard with sidebar in Jovie',
    kind: 'crop',
  },
  {
    id: 'bento-audience',
    scenarioId: 'dashboard-audience-desktop',
    alt: 'Audience CRM in Jovie',
    kind: 'crop',
  },
] as const;

export interface HomepageTaskCard {
  readonly id: string;
  readonly title: string;
  readonly statusTone: 'ready' | 'blocked' | 'today';
  readonly statusLabel: string;
  readonly dueLabel: string;
  readonly meta: string;
}

export type HomepageLabelPartner = 'awal' | 'orchard' | 'umg' | 'armada';

export interface HomepageMonitoringSignal {
  readonly partner: HomepageLabelPartner;
  readonly status: string;
}

export interface HomepageReleaseMock {
  readonly id: string;
  readonly title: string;
  readonly artist: string;
  readonly releaseLabel: string;
  readonly modeLabel: string;
  readonly state: 'presave' | 'live';
  readonly stateDetail: string;
  readonly primaryMetricLabel: string;
  readonly primaryMetricValue: string;
  readonly secondaryMetricLabel: string;
  readonly secondaryMetricValue: string;
  readonly labels: readonly HomepageLabelPartner[];
  readonly artworkTone: 'violet' | 'blue';
}

export const HOME_HERO_TASKS: readonly HomepageTaskCard[] = [
  {
    id: 'editorial-pitch',
    title: 'Submit pitch',
    statusTone: 'ready',
    statusLabel: 'Ready',
    dueLabel: 'Due Tuesday',
    meta: 'Launch prep',
  },
  {
    id: 'release-assets',
    title: 'Build assets',
    statusTone: 'today',
    statusLabel: 'In progress',
    dueLabel: 'Today',
    meta: 'In Jovie',
  },
  {
    id: 'release-email',
    title: 'Send fan email',
    statusTone: 'blocked',
    statusLabel: 'Queued',
    dueLabel: 'Launch day',
    meta: 'Audience',
  },
] as const;

export const HOME_RELEASE_DESTINATION_PRESAVE_MOCK: HomepageReleaseMock = {
  id: 'the-deep-end-presave',
  title: 'The Deep End',
  artist: 'Cosmic Gate & Tim White',
  releaseLabel: 'Dropping soon',
  modeLabel: 'Countdown Presave',
  state: 'presave',
  stateDetail: 'Presave is open',
  primaryMetricLabel: 'Momentum',
  primaryMetricValue: 'Building',
  secondaryMetricLabel: 'Fan action',
  secondaryMetricValue: 'Join in',
  labels: ['orchard', 'armada', 'awal'],
  artworkTone: 'violet',
} as const;

export const HOME_HERO_RELEASE_MOCK = HOME_RELEASE_DESTINATION_PRESAVE_MOCK;

export const HOME_RELEASE_DESTINATION_LIVE_MOCK: HomepageReleaseMock = {
  id: 'take-me-over-live',
  title: 'Take Me Over',
  artist: 'Cosmic Gate & Tim White',
  releaseLabel: 'Released October 1, 2014',
  modeLabel: 'Live Smart Link',
  state: 'live',
  stateDetail: 'Streaming everywhere now',
  primaryMetricLabel: 'Status',
  primaryMetricValue: 'Listening',
  secondaryMetricLabel: 'Fan action',
  secondaryMetricValue: 'Share it',
  labels: ['umg', 'orchard', 'awal', 'armada'],
  artworkTone: 'blue',
} as const;

export const HOME_SMARTLINK_RELEASE_MOCK = HOME_RELEASE_DESTINATION_LIVE_MOCK;

export const HOME_RELEASE_AI_CONTEXT = [
  'Release: The Deep End',
  'Catalog: latest release loaded',
  'Profile: Tim White verified',
] as const;

export const HOME_OPERATING_MONITORING_SIGNALS: readonly HomepageMonitoringSignal[] =
  [
    { partner: 'orchard', status: 'Synced' },
    { partner: 'awal', status: 'Synced' },
    { partner: 'armada', status: 'Check metadata' },
  ] as const;
