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
    title: 'Submit editorial pitch',
    statusTone: 'ready',
    statusLabel: 'Ready',
    dueLabel: 'Due Tuesday',
    meta: 'Launch prep',
  },
  {
    id: 'release-assets',
    title: 'Build release assets',
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
    meta: 'Audience send',
  },
] as const;

export const HOME_RELEASE_DESTINATION_PRESAVE_MOCK: HomepageReleaseMock = {
  id: 'afterlight-presave',
  title: 'Afterlight',
  artist: 'Tim White and Luna Grey',
  releaseLabel: 'Drops April 19, 2026',
  modeLabel: 'Countdown Presave',
  state: 'presave',
  stateDetail: '12 days left',
  primaryMetricLabel: 'Presaves',
  primaryMetricValue: '214',
  secondaryMetricLabel: 'SMS signups',
  secondaryMetricValue: '63',
  labels: ['orchard', 'armada', 'awal'],
  artworkTone: 'violet',
} as const;

export const HOME_HERO_RELEASE_MOCK = HOME_RELEASE_DESTINATION_PRESAVE_MOCK;

export const HOME_RELEASE_DESTINATION_LIVE_MOCK: HomepageReleaseMock = {
  id: 'take-me-over-live',
  title: 'Take Me Over',
  artist: 'Tim White and Sora Vale',
  releaseLabel: 'Released October 1, 2014',
  modeLabel: 'Live Smart Link',
  state: 'live',
  stateDetail: 'Streaming everywhere now',
  primaryMetricLabel: 'Total clicks',
  primaryMetricValue: '480',
  secondaryMetricLabel: 'Last 7 days',
  secondaryMetricValue: '86',
  labels: ['umg', 'orchard', 'awal', 'armada'],
  artworkTone: 'blue',
} as const;

export const HOME_SMARTLINK_RELEASE_MOCK = HOME_RELEASE_DESTINATION_LIVE_MOCK;

export const HOME_RELEASE_AI_CONTEXT = [
  'Release: Take Me Over',
  'Catalog: 21 synced',
  'Profile: Tim White verified',
] as const;

export const HOME_OPERATING_MONITORING_SIGNALS: readonly HomepageMonitoringSignal[] =
  [
    { partner: 'orchard', status: 'Synced' },
    { partner: 'awal', status: 'Synced' },
    { partner: 'armada', status: 'Check metadata' },
  ] as const;
