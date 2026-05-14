export const FOUNDER_DEMO_DURATION_SECONDS = 93;

export const FOUNDER_DEMO_REQUIRED_SCENES = [
  'jovie-alert',
  'signal-panel',
  'campaign-recommendation',
  'approval-execution',
  'fan-facing-layer',
  'monitoring-loop',
] as const;

export type FounderDemoSceneId = (typeof FOUNDER_DEMO_REQUIRED_SCENES)[number];

export interface FounderDemoScene {
  readonly id: FounderDemoSceneId;
  readonly startsAt: number;
  readonly endsAt: number;
  readonly label: string;
}

export const FOUNDER_DEMO_SCENES: readonly FounderDemoScene[] = [
  {
    id: 'jovie-alert',
    startsAt: 0,
    endsAt: 12,
    label: 'Opportunity alert',
  },
  {
    id: 'signal-panel',
    startsAt: 12,
    endsAt: 30,
    label: 'Signal graph',
  },
  {
    id: 'campaign-recommendation',
    startsAt: 30,
    endsAt: 47,
    label: 'Recommendation',
  },
  {
    id: 'approval-execution',
    startsAt: 47,
    endsAt: 62,
    label: 'Execution',
  },
  {
    id: 'fan-facing-layer',
    startsAt: 62,
    endsAt: 76,
    label: 'Fan surface',
  },
  {
    id: 'monitoring-loop',
    startsAt: 76,
    endsAt: FOUNDER_DEMO_DURATION_SECONDS,
    label: 'Monitoring',
  },
] as const;

export const FOUNDER_DEMO_SIGNAL_CARDS = [
  {
    title: 'External signal',
    value: 'Cosmic Gate has festival attention this weekend.',
    meta: 'EDC Las Vegas - May 15-17',
  },
  {
    title: 'Catalog match',
    value: 'The Deep End is your collaboration with Cosmic Gate.',
    meta: 'Tim White x Cosmic Gate',
  },
  {
    title: 'Audience signal',
    value: 'Your trance fan segment has recent Jovie Link activity.',
    meta: 'Prior clickers, buyers, subscribers',
  },
  {
    title: 'Commerce signal',
    value: 'Prime Day is returning in June.',
    meta: 'Higher commerce intent window',
  },
] as const;

export const FOUNDER_DEMO_PRODUCTS = [
  {
    name: 'The Deep End Festival Tee',
    price: '$38',
    bestFor: 'Broad trance fan segment',
    target: '263 orders',
    recommended: true,
  },
  {
    name: 'Trance-Era Poster',
    price: '$45',
    bestFor: 'Collectors and longtime fans',
    target: '223 orders',
    recommended: false,
  },
  {
    name: 'Deep End Weekend Hoodie',
    price: '$88',
    bestFor: 'High-intent fans',
    target: '114 orders',
    recommended: false,
  },
] as const;

export const FOUNDER_DEMO_EXECUTION_STEPS = [
  'Create campaign',
  'Update Jovie Link',
  'Draft fan notification',
  'Select audience',
  'Create content tasks',
  'Schedule drop',
  'Monitor performance',
] as const;

export const FOUNDER_DEMO_CAPABILITY_BACKLOG = [
  'External opportunity detector',
  'Catalog/collaborator signal matching',
  'Fan segment builder from Jovie Link/activity/buyers/subscribers',
  'Campaign recommendation engine with timing and revenue math',
  'Merch/drop creation workflow',
  'One-click campaign approval orchestrator',
  'Campaign-aware fan notification scheduling',
  'Campaign monitoring and next-move recommendation loop',
  'Release workflow system from imported catalog and domain playbooks',
] as const;

export const FOUNDER_DEMO_FORBIDDEN_PUBLIC_COPY = [
  'YC',
  'a16z',
  'accelerator',
  'prototype',
  'loading demo',
] as const;

export function getFounderDemoSceneAt(seconds: number): FounderDemoScene {
  const scene = FOUNDER_DEMO_SCENES.find(
    item => seconds >= item.startsAt && seconds < item.endsAt
  );

  return scene ?? FOUNDER_DEMO_SCENES[FOUNDER_DEMO_SCENES.length - 1]!;
}
