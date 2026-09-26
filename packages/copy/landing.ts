import { lintCopy } from './lint';

/**
 * Landing pages are compiled in order. A stage runs only after every earlier
 * stage passes; agents loop on the first failing stage until it is clean.
 *
 * Great page = great capabilities -> outcomes -> copy -> layout -> style ->
 * design system -> product proof -> stats and quotes.
 */
export const LANDING_STAGES = [
  'capabilities',
  'outcomes',
  'copy',
  'layout',
  'style',
  'designSystem',
  'proof',
  'social',
] as const;
export type LandingStage = (typeof LANDING_STAGES)[number];

export interface LandingSpec {
  readonly id: string;
  readonly route: string;
  readonly audience: string;
  /** What the product can do today, each backed by verifiable evidence. */
  readonly capabilities: readonly {
    id: string;
    statement: string;
    status: 'shipped' | 'beta' | 'waitlist';
    evidence: readonly string[]; // route, test, or ProductMoment ids
  }[];
  /** What the reader gets, in their words. Each rests on real capabilities. */
  readonly outcomes: readonly {
    id: string;
    statement: string;
    capabilityIds: readonly string[];
  }[];
  readonly sections: readonly {
    id: string;
    job: string;
    outcomeId: string;
    headline: string;
    body?: string;
    cta?: { label: string; href: string };
  }[];
  readonly layout?: { recipeId: string; sectionOrder: readonly string[] };
  readonly style?: { theme: string; tokensVersion: string };
  readonly designSystem?: { components: readonly string[] };
  readonly proof: readonly {
    id: string;
    kind: 'product-moment' | 'screenshot' | 'video' | 'demo';
    sectionId: string;
    capabilityIds: readonly string[];
    source: string;
  }[];
  readonly stats: readonly {
    id: string;
    value: string;
    label: string;
    source: string;
    asOf: string;
  }[];
  readonly quotes: readonly {
    id: string;
    text: string;
    author: string;
    permission: 'written' | 'public-post';
    source: string;
  }[];
}

export interface LandingIssue {
  readonly stage: LandingStage;
  readonly code: string;
  readonly ref: string;
  readonly message: string;
}

export type LandingCheck = (spec: LandingSpec) => readonly LandingIssue[];

export interface LandingPipelineResult {
  readonly ok: boolean;
  readonly passed: readonly LandingStage[];
  readonly failedStage?: LandingStage;
  readonly issues: readonly LandingIssue[];
}

const HERO_HEADLINE_WORDS = 8;
const HEADLINE_WORDS = 12;
const CTA_WORDS = 4;
const STAT_MAX_AGE_DAYS = 365;

const wordCount = (text: string) => text.split(/\s+/).filter(Boolean).length;

function lintIssues(
  stage: LandingStage,
  ref: string,
  text: string,
  register: 'jovie-marketing' | 'customer-voice'
) {
  return lintCopy(text, { register }).blocking.map(finding => ({
    stage,
    code: `COPY_${finding.rule.toUpperCase().replace(/-/g, '_')}`,
    ref,
    message: `"${finding.match}": ${finding.message}`,
  }));
}

const STAGE_CHECKS: Readonly<Record<LandingStage, LandingCheck>> = {
  capabilities: spec => {
    const issues: LandingIssue[] = [];
    if (spec.capabilities.length === 0)
      issues.push({
        stage: 'capabilities',
        code: 'NO_CAPABILITIES',
        ref: spec.id,
        message: 'List what the product actually does first.',
      });
    for (const capability of spec.capabilities) {
      if (capability.evidence.length === 0)
        issues.push({
          stage: 'capabilities',
          code: 'CAPABILITY_WITHOUT_EVIDENCE',
          ref: capability.id,
          message:
            'Every capability needs a route, test, or ProductMoment proving it exists.',
        });
    }
    return issues;
  },
  outcomes: spec => {
    const issues: LandingIssue[] = [];
    const usable = new Map(
      spec.capabilities.map(capability => [
        capability.id,
        capability.status !== 'waitlist',
      ])
    );
    if (spec.outcomes.length === 0)
      issues.push({
        stage: 'outcomes',
        code: 'NO_OUTCOMES',
        ref: spec.id,
        message: 'Name what the reader gets before writing copy.',
      });
    for (const outcome of spec.outcomes) {
      if (
        outcome.capabilityIds.length === 0 ||
        outcome.capabilityIds.some(id => !usable.has(id))
      )
        issues.push({
          stage: 'outcomes',
          code: 'OUTCOME_UNBACKED',
          ref: outcome.id,
          message: 'Outcome must rest on registered capabilities.',
        });
      else if (!outcome.capabilityIds.some(id => usable.get(id)))
        issues.push({
          stage: 'outcomes',
          code: 'OUTCOME_ON_WAITLIST_ONLY',
          ref: outcome.id,
          message: 'Outcome rests only on unreleased capabilities.',
        });
      issues.push(
        ...lintIssues(
          'outcomes',
          outcome.id,
          outcome.statement,
          'jovie-marketing'
        )
      );
    }
    return issues;
  },
  copy: spec => {
    const issues: LandingIssue[] = [];
    const outcomes = new Set(spec.outcomes.map(outcome => outcome.id));
    spec.sections.forEach((section, index) => {
      const limit = index === 0 ? HERO_HEADLINE_WORDS : HEADLINE_WORDS;
      if (!outcomes.has(section.outcomeId))
        issues.push({
          stage: 'copy',
          code: 'SECTION_WITHOUT_OUTCOME',
          ref: section.id,
          message: 'Every section argues exactly one registered outcome.',
        });
      if (wordCount(section.headline) > limit)
        issues.push({
          stage: 'copy',
          code: 'HEADLINE_TOO_LONG',
          ref: section.id,
          message: `${wordCount(section.headline)} words; limit ${limit}.`,
        });
      if (
        section.cta &&
        (wordCount(section.cta.label) > CTA_WORDS || !section.cta.href)
      )
        issues.push({
          stage: 'copy',
          code: 'CTA_INVALID',
          ref: section.id,
          message: `CTA needs a real destination and at most ${CTA_WORDS} words.`,
        });
      for (const text of [section.headline, section.body, section.cta?.label]) {
        if (text)
          issues.push(
            ...lintIssues('copy', section.id, text, 'jovie-marketing')
          );
      }
    });
    const used = new Set(spec.sections.map(section => section.outcomeId));
    for (const outcome of spec.outcomes) {
      if (!used.has(outcome.id))
        issues.push({
          stage: 'copy',
          code: 'OUTCOME_UNUSED',
          ref: outcome.id,
          message:
            'Registered outcome never appears on the page. Use it or drop it.',
        });
    }
    return issues;
  },
  layout: spec => {
    if (!spec.layout)
      return [
        {
          stage: 'layout',
          code: 'NO_LAYOUT',
          ref: spec.id,
          message: 'Choose an approved recipe.',
        },
      ];
    const expected = spec.sections
      .map(section => section.id)
      .sort()
      .join();
    const actual = [...spec.layout.sectionOrder].sort().join();
    return expected === actual
      ? []
      : [
          {
            stage: 'layout',
            code: 'LAYOUT_SECTION_MISMATCH',
            ref: spec.layout.recipeId,
            message: 'Layout order must place every copy section exactly once.',
          },
        ];
  },
  style: spec =>
    spec.style
      ? []
      : [
          {
            stage: 'style',
            code: 'NO_STYLE',
            ref: spec.id,
            message: 'Declare theme and token version.',
          },
        ],
  designSystem: spec =>
    spec.designSystem?.components.length
      ? []
      : [
          {
            stage: 'designSystem',
            code: 'NO_COMPONENTS',
            ref: spec.id,
            message: 'Compose from registered components only.',
          },
        ],
  proof: spec => {
    const issues: LandingIssue[] = [];
    const capabilities = new Set(
      spec.capabilities.map(capability => capability.id)
    );
    const outcomes = new Map(
      spec.outcomes.map(outcome => [outcome.id, outcome.capabilityIds])
    );
    for (const proof of spec.proof) {
      if (
        proof.capabilityIds.some(id => !capabilities.has(id)) ||
        !proof.source
      )
        issues.push({
          stage: 'proof',
          code: 'PROOF_UNBOUND',
          ref: proof.id,
          message:
            'Proof must show a registered capability from a reproducible source.',
        });
    }
    const hero = spec.sections[0];
    if (hero) {
      const heroCapabilities = outcomes.get(hero.outcomeId) ?? [];
      const proven = spec.proof.some(
        proof =>
          proof.sectionId === hero.id &&
          proof.capabilityIds.some(id => heroCapabilities.includes(id))
      );
      if (!proven)
        issues.push({
          stage: 'proof',
          code: 'HERO_WITHOUT_PROOF',
          ref: hero.id,
          message: 'The hero promise needs real product on screen.',
        });
    }
    return issues;
  },
  social: spec => {
    const issues: LandingIssue[] = [];
    const now = Date.now();
    for (const stat of spec.stats) {
      const age = (now - Date.parse(stat.asOf)) / 86_400_000;
      if (!/\d/.test(stat.value) || !stat.source)
        issues.push({
          stage: 'social',
          code: 'STAT_UNSOURCED',
          ref: stat.id,
          message: 'A stat is a number with a source.',
        });
      if (!Number.isFinite(age) || age > STAT_MAX_AGE_DAYS)
        issues.push({
          stage: 'social',
          code: 'STAT_STALE',
          ref: stat.id,
          message: `Stats must be dated within ${STAT_MAX_AGE_DAYS} days.`,
        });
      issues.push(
        ...lintIssues(
          'social',
          stat.id,
          `${stat.value} ${stat.label}`,
          'jovie-marketing'
        )
      );
    }
    for (const quote of spec.quotes) {
      if (!quote.author || !quote.source)
        issues.push({
          stage: 'social',
          code: 'QUOTE_UNATTRIBUTED',
          ref: quote.id,
          message: 'Quotes need a real, attributable person and source.',
        });
      // Their words, their voice: only the universal floor applies.
      issues.push(
        ...lintIssues('social', quote.id, quote.text, 'customer-voice')
      );
    }
    return issues;
  },
};

/**
 * Run stages in order, stopping at the first failure. `extra` lets the web app
 * add its registry validators (recipes, composition, tokens) to a stage
 * without this package importing app code.
 */
export function runLandingPipeline(
  spec: LandingSpec,
  extra: Partial<Record<LandingStage, LandingCheck>> = {}
): LandingPipelineResult {
  const passed: LandingStage[] = [];
  for (const stage of LANDING_STAGES) {
    const issues = [
      ...STAGE_CHECKS[stage](spec),
      ...(extra[stage]?.(spec) ?? []),
    ];
    if (issues.length > 0)
      return { ok: false, passed, failedStage: stage, issues };
    passed.push(stage);
  }
  return { ok: true, passed, issues: [] };
}
