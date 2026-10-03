export const HERO_VARIANT_NAMES = [
  'split-link-claim',
  'left-content',
  'left-buttons',
  'centered-homepage',
  'npm-copy',
  'f-layout-desktop-screenshot',
  'mobile-390',
] as const;

export type HeroVariantName = (typeof HERO_VARIANT_NAMES)[number];
export type DesktopHeroVariantName = Exclude<HeroVariantName, 'mobile-390'>;

export interface HeroVariantContract {
  readonly variant: HeroVariantName;
  readonly penId: string;
  readonly useWhen: string;
}

/** Ordered only for stable snapshots; selection is driven by the typed use case. */
export const HERO_DECISION_TABLE = [
  {
    variant: 'split-link-claim',
    penId: 'xm2iz',
    useWhen: 'claim conversion',
  },
  {
    variant: 'left-content',
    penId: 'WQe2p',
    useWhen: 'informational',
  },
  {
    variant: 'left-buttons',
    penId: 'lnKPH',
    useWhen: 'two actions',
  },
  {
    variant: 'centered-homepage',
    penId: 'OxwR1',
    useWhen: 'homepage only',
  },
  {
    variant: 'npm-copy',
    penId: 'KhYER',
    useWhen: 'developer audience with a copy-command action',
  },
  {
    variant: 'f-layout-desktop-screenshot',
    penId: 'joK4X',
    useWhen: 'an aha capture exists',
  },
  {
    variant: 'mobile-390',
    penId: 'qENyP',
    useWhen: 'responsive projection only',
  },
] as const satisfies readonly HeroVariantContract[];

export const HERO_PEN_ID_BY_VARIANT = Object.fromEntries(
  HERO_DECISION_TABLE.map(contract => [contract.variant, contract.penId])
) as Readonly<Record<HeroVariantName, string>>;

export const MARKETING_HEADER_DECISION = {
  penId: 'eoUUU',
  instanceCount: 1,
  states: ['docked', 'scrolled'],
} as const;

export type HeroDecisionInput =
  | {
      readonly useCase: 'claim-conversion';
      readonly conversion: 'claim-handle' | 'claim-profile';
    }
  | { readonly useCase: 'informational' }
  | { readonly useCase: 'two-actions'; readonly actionCount: 2 }
  | { readonly useCase: 'homepage'; readonly route: '/' }
  | {
      readonly useCase: 'copy-command';
      readonly audience: 'developer';
      readonly action: 'copy-command';
    }
  | { readonly useCase: 'aha-capture'; readonly captureId: string }
  | {
      readonly useCase: 'responsive-projection';
      readonly viewportWidth: 390;
      readonly sourceVariant: DesktopHeroVariantName;
    };

function contractFor(variant: HeroVariantName): HeroVariantContract {
  const contract = HERO_DECISION_TABLE.find(item => item.variant === variant);
  if (!contract) throw new Error(`Missing locked hero contract for ${variant}`);
  return contract;
}

export function selectHeroDecision(
  input: HeroDecisionInput
): HeroVariantContract {
  switch (input.useCase) {
    case 'claim-conversion':
      return contractFor('split-link-claim');
    case 'informational':
      return contractFor('left-content');
    case 'two-actions':
      return contractFor('left-buttons');
    case 'homepage':
      return contractFor('centered-homepage');
    case 'copy-command':
      return contractFor('npm-copy');
    case 'aha-capture':
      if (!input.captureId.trim()) {
        throw new Error('The F-layout hero requires an aha capture.');
      }
      return contractFor('f-layout-desktop-screenshot');
    case 'responsive-projection':
      return contractFor('mobile-390');
  }
}

/**
 * Code side of each locked Pen variant. `sectionVariantId` is the hero
 * variant id in `MARKETING_SECTIONS` (sections.ts) that route manifests bind;
 * null means the code has no variant for this Pen hero yet and a section
 * request (plan §1c) must build it before a route may select it.
 */
export interface HeroCodeBinding {
  readonly component: 'components/marketing/MarketingHero';
  readonly sectionVariantId: string | null;
  /** How MarketingHero renders it, so a builder knows the target shape. */
  readonly implementation: string;
}

export const HERO_CODE_BINDING_BY_VARIANT = {
  'split-link-claim': {
    component: 'components/marketing/MarketingHero',
    sectionVariantId: 'split-claim-card',
    implementation: "shell variant='split' with a claim card beside the copy",
  },
  'left-content': {
    component: 'components/marketing/MarketingHero',
    sectionVariantId: 'left-none',
    implementation: "shell variant='left', copy only",
  },
  'left-buttons': {
    component: 'components/marketing/MarketingHero',
    sectionVariantId: null,
    implementation:
      "content mode align='left' with primaryCta and secondaryCta",
  },
  'centered-homepage': {
    component: 'components/marketing/MarketingHero',
    sectionVariantId: null,
    implementation:
      "content mode align='center' on / only (JOV-5085 name search)",
  },
  'npm-copy': {
    component: 'components/marketing/MarketingHero',
    sectionVariantId: null,
    implementation: 'content mode with a copy-command primary action',
  },
  'f-layout-desktop-screenshot': {
    component: 'components/marketing/MarketingHero',
    sectionVariantId: 'split-screenshot-right',
    implementation: 'content mode with an aha capture as media',
  },
  'mobile-390': {
    component: 'components/marketing/MarketingHero',
    sectionVariantId: null,
    implementation: 'responsive projection of the chosen desktop variant',
  },
} as const satisfies Readonly<Record<HeroVariantName, HeroCodeBinding>>;

/**
 * Code hero variants with no locked N8WMP counterpart. Routes bound to these
 * converge on a locked variant; the list only shrinks.
 */
export const UNLOCKED_HERO_CODE_VARIANTS = [
  'centered-handle-claim',
  'centered-phone',
  'centered-none',
] as const;

export function heroVariantForCodeVariant(
  sectionVariantId: string
): HeroVariantName | null {
  const match = HERO_VARIANT_NAMES.find(
    name =>
      HERO_CODE_BINDING_BY_VARIANT[name].sectionVariantId === sectionVariantId
  );
  return match ?? null;
}

export type HeroRouteMismatch =
  /** The manifest hero binding carries no variant id. */
  | 'unbound'
  /** Bound to a code variant with no locked Pen counterpart. */
  | 'unlocked-code-variant'
  /** Bound to a locked variant other than the one the table selects. */
  | 'wrong-variant';

export interface HeroRouteIntent {
  readonly url: string;
  readonly input: HeroDecisionInput;
  readonly why: string;
}

/**
 * The hero job of every active manifest route that renders a hero. The
 * table in `selectHeroDecision` turns each job into exactly one variant.
 */
export const HERO_ROUTE_INTENTS: readonly HeroRouteIntent[] = [
  { url: '/', input: { useCase: 'homepage', route: '/' }, why: 'homepage' },
  {
    url: '/pricing',
    input: { useCase: 'two-actions', actionCount: 2 },
    why: 'primary and secondary pricing CTAs',
  },
  ...['/artist-profiles', '/artist-profile', '/solutions/*'].map(
    (url): HeroRouteIntent => ({
      url,
      input: { useCase: 'claim-conversion', conversion: 'claim-profile' },
      why: 'artist landing page converts by claiming a profile',
    })
  ),
  {
    url: '/artist-notifications',
    input: { useCase: 'claim-conversion', conversion: 'claim-profile' },
    why: 'single primary CTA into profile claim',
  },
  {
    url: '/download',
    input: { useCase: 'two-actions', actionCount: 2 },
    why: 'desktop download plus iPhone alpha',
  },
  {
    url: '/pay',
    input: { useCase: 'claim-conversion', conversion: 'claim-handle' },
    why: 'hero renders ClaimHandleForm',
  },
  {
    url: '/voice',
    input: { useCase: 'two-actions', actionCount: 2 },
    why: 'landing hero with primary and secondary CTA',
  },
  {
    url: '/instant-merch',
    input: { useCase: 'two-actions', actionCount: 2 },
    why: 'create merch plus see the flow',
  },
  {
    url: '/youtube-thumbnails',
    input: { useCase: 'informational' },
    why: 'paste-first form sits below a copy-only hero',
  },
  {
    url: '/product',
    input: { useCase: 'claim-conversion', conversion: 'claim-handle' },
    why: 'hero renders ProductClaimCard',
  },
  {
    url: '/card',
    input: { useCase: 'aha-capture', captureId: 'jovie-card-preview' },
    why: 'product evidence is a framed screenshot',
  },
  {
    url: '/smart-links',
    input: { useCase: 'two-actions', actionCount: 2 },
    why: 'primary and secondary buttons',
  },
  {
    url: '/launch',
    input: { useCase: 'two-actions', actionCount: 2 },
    why: 'primary and secondary launch links',
  },
  ...[
    '/about',
    '/support',
    '/compare/*',
    '/alternatives/*',
    '/blog',
    '/blog/category/*',
    '/waitlist',
  ].map(
    (url): HeroRouteIntent => ({
      url,
      input: { useCase: 'informational' },
      why: 'informational route, no hero conversion',
    })
  ),
  {
    url: '/cli',
    input: {
      useCase: 'copy-command',
      audience: 'developer',
      action: 'copy-command',
    },
    why: 'developer page whose first action is installing the CLI',
  },
];

export interface HeroRouteAuditRow {
  readonly url: string;
  readonly observedCodeVariant: string | null;
  readonly observed: HeroVariantName | null;
  readonly expected: HeroVariantName;
  readonly mismatch: HeroRouteMismatch | null;
}

/** Compares each route's bound code hero with the variant the table picks. */
export function auditHeroRoutes(
  boundCodeVariantByUrl: ReadonlyMap<string, string | null>,
  intents: readonly HeroRouteIntent[] = HERO_ROUTE_INTENTS
): readonly HeroRouteAuditRow[] {
  return intents.map(intent => {
    const observedCodeVariant = boundCodeVariantByUrl.get(intent.url) ?? null;
    const observed = observedCodeVariant
      ? heroVariantForCodeVariant(observedCodeVariant)
      : null;
    const expected = selectHeroDecision(intent.input).variant;
    let mismatch: HeroRouteMismatch | null = null;
    if (!observedCodeVariant) mismatch = 'unbound';
    else if (!observed) mismatch = 'unlocked-code-variant';
    else if (observed !== expected) mismatch = 'wrong-variant';
    return {
      url: intent.url,
      observedCodeVariant,
      observed,
      expected,
      mismatch,
    };
  });
}

/** A page record's declared hero, from its per-record contract. */
export interface HeroRecordBinding {
  readonly url: string;
  readonly heroVariant: HeroVariantName;
}

/**
 * The hero intent for a concrete pathname: an exact intent wins, else the
 * family wildcard (`/solutions/*`) whose prefix matches one segment.
 */
export function heroIntentForPathname(
  pathname: string,
  intents: readonly HeroRouteIntent[] = HERO_ROUTE_INTENTS
): HeroRouteIntent | null {
  const exact = intents.find(intent => intent.url === pathname);
  if (exact) return exact;
  return (
    intents.find(intent => {
      if (!intent.url.endsWith('/*')) return false;
      const prefix = intent.url.slice(0, -1);
      const rest = pathname.slice(prefix.length);
      return pathname.startsWith(prefix) && rest !== '' && !rest.includes('/');
    }) ?? null
  );
}

export interface HeroRecordAuditRow {
  readonly url: string;
  readonly observed: HeroVariantName;
  /** Null when no hero intent covers the record path. */
  readonly expected: HeroVariantName | null;
  readonly mismatch: 'unbound' | 'wrong-variant' | null;
}

/**
 * Audits each record's declared `heroVariant` against the table's pick for
 * the record's own path. A record with no hero intent is `unbound`.
 */
export function auditRecordHeroes(
  records: readonly HeroRecordBinding[],
  intents: readonly HeroRouteIntent[] = HERO_ROUTE_INTENTS
): readonly HeroRecordAuditRow[] {
  return records.map(record => {
    const intent = heroIntentForPathname(record.url, intents);
    const expected = intent ? selectHeroDecision(intent.input).variant : null;
    let mismatch: HeroRecordAuditRow['mismatch'] = null;
    if (!expected) mismatch = 'unbound';
    else if (record.heroVariant !== expected) mismatch = 'wrong-variant';
    return {
      url: record.url,
      observed: record.heroVariant,
      expected,
      mismatch,
    };
  });
}
