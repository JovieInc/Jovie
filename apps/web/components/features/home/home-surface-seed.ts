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
  id: 'afterlight-presave',
  title: 'Afterlight',
  artist: 'Tim White',
  releaseLabel: 'Drops April 19, 2026',
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
  artist: 'Tim White',
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
  'Release: Take Me Over',
  'Catalog: latest release loaded',
  'Profile: Tim White verified',
] as const;

export const HOME_OPERATING_MONITORING_SIGNALS: readonly HomepageMonitoringSignal[] =
  [
    { partner: 'orchard', status: 'Synced' },
    { partner: 'awal', status: 'Synced' },
    { partner: 'armada', status: 'Check metadata' },
  ] as const;
