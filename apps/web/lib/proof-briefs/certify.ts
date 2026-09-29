import type {
  BriefAudience,
  Certification,
  CertificationFinding,
  DisclosureScope,
  ProofBrief,
  ProofEvent,
} from './types';

export const CERTIFIER_VERSION = 'proof-brief-certifier@1';

/**
 * Confidentiality required by the evidence / carried by the brief. Higher
 * rank = more restrictive. An event may appear only in briefs whose scope is
 * at least as confidential.
 */
const DISCLOSURE_RANK: Record<DisclosureScope, number> = {
  public: 0,
  internal: 1,
  private: 2,
};

/** Audiences that may receive 'internal' scope; 'private' is subject-only. */
const AUDIENCE_MAX_DISCLOSURE: Record<BriefAudience, DisclosureScope> = {
  investor: 'public',
  customer: 'private',
  manager: 'internal',
  founder: 'internal',
  internal: 'internal',
};

export function maxDisclosureForAudience(
  audience: BriefAudience
): DisclosureScope {
  return AUDIENCE_MAX_DISCLOSURE[audience];
}

export function disclosureAllowed(
  eventScope: DisclosureScope,
  briefScope: DisclosureScope
): boolean {
  return DISCLOSURE_RANK[eventScope] <= DISCLOSURE_RANK[briefScope];
}

/**
 * Terms that signal internal/engineering jargon. A brief written for a smart
 * nontechnical reader must not lean on these; approved or generated wording
 * containing them fails `understandable`.
 */
const JARGON =
  /\b(primitives?|pipeline|normalized?|refactor(?:ed|ing)?|infra(?:structure)?|sdk|api|orm|schema|middleware|heuristic|deterministic|idempotent|observability|denormalized|shard(?:ing)?|rollup|etl|webhook|backfill|migration|codec|serializer|abstraction|instantiated|leveraged|synergy|utiliz(?:e|ed|ation))\b/i;

/**
 * Causal language. Only `direct` attribution may use it, and only when the
 * underlying evidence states a `changed` outcome.
 */
const CAUSAL =
  /\b(drove|caused|led to|resulted in|boosted|lifted|improved|cut|because of|thanks to)\b/i;

/** Claims that require a matching metric predicate to be present. */
const HARD_CLAIMS: readonly {
  pattern: RegExp;
  predicateIncludes: string;
  label: string;
}[] = [
  {
    pattern: /\b(revenue|arr|mrr|bookings?)\b/i,
    predicateIncludes: 'revenue',
    label: 'revenue',
  },
  {
    pattern: /\b(every(?:one| user| artist)|all users|all artists|100%)\b/i,
    predicateIncludes: 'coverage',
    label: 'availability/adoption',
  },
];

const DAY_MS = 24 * 60 * 60 * 1000;

function daysBetween(isoA: string, isoB: string): number {
  return Math.abs(Date.parse(isoB) - Date.parse(isoA)) / DAY_MS;
}

export function isCurrent(
  event: ProofEvent,
  asOf: string,
  windowDays: number
): boolean {
  return daysBetween(event.observedAt, asOf) <= windowDays;
}

/** Eligible for selection: verified, in-window, within disclosure scope. */
export function isEligible(
  event: ProofEvent,
  subjectEntityId: string,
  asOf: string,
  windowDays: number,
  scope: DisclosureScope
): boolean {
  if (event.subjectEntityId !== subjectEntityId) return false;
  if (event.status !== 'verified') return false;
  if (!isCurrent(event, asOf, windowDays)) return false;
  return disclosureAllowed(event.disclosure, scope);
}

function checkTruthCurrent(
  brief: ProofBrief,
  events: readonly ProofEvent[]
): CertificationFinding[] {
  const findings: CertificationFinding[] = [];
  const byId = new Map(events.map(e => [e.id, e]));
  for (const h of [brief.hero, ...brief.supporting]) {
    const ev = byId.get(h.eventId);
    if (!ev) {
      findings.push({
        check: 'truth-current',
        severity: 'fail',
        detail: `selected evidence ${h.eventId} not in input set`,
      });
      continue;
    }
    if (ev.revision !== h.revision) {
      findings.push({
        check: 'truth-current',
        severity: 'fail',
        detail: `${h.eventId}: revision drift (${h.revision} != ${ev.revision})`,
      });
    }
    if (ev.status !== 'verified') {
      findings.push({
        check: 'truth-current',
        severity: 'fail',
        detail: `${h.eventId}: status ${ev.status}`,
      });
    }
    if (!isCurrent(ev, brief.asOf, brief.windowDays)) {
      findings.push({
        check: 'truth-current',
        severity: 'fail',
        detail: `${h.eventId}: observed ${ev.observedAt} outside ${brief.windowDays}d window ending ${brief.asOf}`,
      });
    }
    if (ev.did !== h.did) {
      findings.push({
        check: 'truth-current',
        severity: 'fail',
        detail: `${h.eventId}: 'did' wording drifted from evidence`,
      });
    }
  }
  return findings;
}

function checkMeaningful(
  brief: ProofBrief,
  events: readonly ProofEvent[]
): CertificationFinding[] {
  const byId = new Map(events.map(e => [e.id, e]));
  const hero = byId.get(brief.hero.eventId);
  const heroRel = hero?.audienceRelevance[brief.audience] ?? 0;
  if (heroRel < 0.5) {
    return [
      {
        check: 'meaningful',
        severity: 'fail',
        detail: `hero relevance ${heroRel.toFixed(2)} below 0.5 for ${brief.audience}`,
      },
    ];
  }
  return [];
}

function checkUnderstandable(brief: ProofBrief): CertificationFinding[] {
  const findings: CertificationFinding[] = [];
  for (const h of [brief.hero, ...brief.supporting]) {
    const jargon = h.wording.match(JARGON);
    if (jargon) {
      findings.push({
        check: 'understandable',
        severity: 'fail',
        detail: `${h.eventId}: jargon '${jargon[0]}' in wording`,
      });
    }
    if (h.wording.length > 220) {
      findings.push({
        check: 'understandable',
        severity: 'warn',
        detail: `${h.eventId}: wording over 220 chars`,
      });
    }
  }
  return findings;
}

function checkNoOverclaim(
  brief: ProofBrief,
  events: readonly ProofEvent[]
): CertificationFinding[] {
  const findings: CertificationFinding[] = [];
  const byId = new Map(events.map(e => [e.id, e]));
  for (const h of [brief.hero, ...brief.supporting]) {
    const ev = byId.get(h.eventId);
    const causal = h.wording.match(CAUSAL);
    if (causal && h.attribution !== 'direct') {
      findings.push({
        check: 'no-overclaim',
        severity: 'fail',
        detail: `${h.eventId}: causal wording '${causal[0]}' with attribution '${h.attribution}'`,
      });
    }
    if (causal && !h.changed) {
      findings.push({
        check: 'no-overclaim',
        severity: 'fail',
        detail: `${h.eventId}: causal wording '${causal[0]}' but evidence records no outcome`,
      });
    }
    for (const hard of HARD_CLAIMS) {
      if (
        hard.pattern.test(h.wording) &&
        !ev?.metric?.predicate.includes(hard.predicateIncludes)
      ) {
        findings.push({
          check: 'no-overclaim',
          severity: 'fail',
          detail: `${h.eventId}: ${hard.label} claim not backed by metric predicate`,
        });
      }
    }
    if (ev?.metric && h.wording.match(/\d/)) {
      // Strip duration windows ('over 7d') so window digits aren't claims.
      const stripped = h.wording.replace(
        /\b\d+\s*(?:d|day|days|h|hr|w|mo)\b/gi,
        ''
      );
      const numbers = stripped.match(/\d[\d,.]*%?/g) ?? [];
      const known = [ev.metric.before, ev.metric.after, ev.metric.value]
        .filter((n): n is number => n !== undefined)
        .map(n => String(n));
      for (const num of numbers) {
        const normalized = num.replace(/%$/, '');
        if (!known.some(k => k === normalized)) {
          findings.push({
            check: 'no-overclaim',
            severity: 'fail',
            detail: `${h.eventId}: number '${num}' not in evidence metric`,
          });
        }
      }
    }
  }
  return findings;
}

function checkDenominators(
  brief: ProofBrief,
  events: readonly ProofEvent[]
): CertificationFinding[] {
  const findings: CertificationFinding[] = [];
  const byId = new Map(events.map(e => [e.id, e]));
  for (const h of [brief.hero, ...brief.supporting]) {
    const ev = byId.get(h.eventId);
    if (!ev?.metric) continue;
    const m = ev.metric;
    const isRate =
      m.unit === '%' || /rate|percent|conversion|share/i.test(m.label);
    if (isRate && !m.denominator) {
      findings.push({
        check: 'denominators',
        severity: 'fail',
        detail: `${h.eventId}: rate metric '${m.label}' missing denominator`,
      });
    }
    if (!m.window) {
      findings.push({
        check: 'denominators',
        severity: 'warn',
        detail: `${h.eventId}: metric '${m.label}' missing window`,
      });
    }
    for (const limitation of ev.limitations) {
      if (!brief.limitations.includes(limitation)) {
        findings.push({
          check: 'denominators',
          severity: 'fail',
          detail: `${h.eventId}: required limitation dropped: '${limitation}'`,
        });
      }
    }
  }
  return findings;
}

function checkNoFiller(
  brief: ProofBrief,
  events: readonly ProofEvent[]
): CertificationFinding[] {
  const findings: CertificationFinding[] = [];
  const byId = new Map(events.map(e => [e.id, e]));
  if (brief.supporting.length > 3) {
    findings.push({
      check: 'no-filler',
      severity: 'fail',
      detail: `more than 3 supporting items (${brief.supporting.length})`,
    });
  }
  for (const h of brief.supporting) {
    const rel = byId.get(h.eventId)?.audienceRelevance[brief.audience] ?? 0;
    if (rel < 0.35) {
      findings.push({
        check: 'no-filler',
        severity: 'fail',
        detail: `${h.eventId}: supporting relevance ${rel.toFixed(2)} below 0.35 — padding`,
      });
    }
  }
  return findings;
}

function checkNoMaterialOmission(
  brief: ProofBrief,
  events: readonly ProofEvent[]
): CertificationFinding[] {
  const findings: CertificationFinding[] = [];
  const byId = new Map(events.map(e => [e.id, e]));
  const selectedIds = new Set(brief.evidence.map(e => e.id));
  const hero = byId.get(brief.hero.eventId);
  const heroRel = hero?.audienceRelevance[brief.audience] ?? 0;

  for (const ev of events) {
    if (selectedIds.has(ev.id)) continue;
    if (
      isEligible(
        ev,
        brief.subjectEntityId,
        brief.asOf,
        brief.windowDays,
        brief.disclosureScope
      ) &&
      (ev.audienceRelevance[brief.audience] ?? 0) > heroRel
    ) {
      findings.push({
        check: 'no-material-omission',
        severity: 'fail',
        detail: `${ev.id}: eligible event outranks hero but was omitted`,
      });
    }
  }

  // A stale/contradicted event on the same metric predicate as a selected
  // event materially changes how the recipient reads the number.
  const selectedPredicates = new Set(
    [brief.hero, ...brief.supporting]
      .map(h => byId.get(h.eventId)?.metric?.predicate)
      .filter((p): p is string => p !== undefined)
  );
  for (const ev of events) {
    if (selectedIds.has(ev.id)) continue;
    if (ev.subjectEntityId !== brief.subjectEntityId) continue;
    if (ev.status !== 'contradicted' && ev.status !== 'stale') continue;
    if (ev.metric && selectedPredicates.has(ev.metric.predicate)) {
      findings.push({
        check: 'no-material-omission',
        severity: 'fail',
        detail: `${ev.id}: ${ev.status} evidence conflicts with selected metric '${ev.metric.predicate}'`,
      });
    }
  }
  return findings;
}

function checkDisclosure(
  brief: ProofBrief,
  events: readonly ProofEvent[]
): CertificationFinding[] {
  const findings: CertificationFinding[] = [];
  const byId = new Map(events.map(e => [e.id, e]));
  const cap = maxDisclosureForAudience(brief.audience);
  const effectiveCap =
    DISCLOSURE_RANK[cap] < DISCLOSURE_RANK[brief.disclosureScope]
      ? cap
      : brief.disclosureScope;
  if (DISCLOSURE_RANK[brief.disclosureScope] > DISCLOSURE_RANK[cap]) {
    findings.push({
      check: 'disclosure-bound',
      severity: 'fail',
      detail: `brief scope '${brief.disclosureScope}' exceeds audience cap '${cap}'`,
    });
  }
  for (const h of [brief.hero, ...brief.supporting]) {
    const ev = byId.get(h.eventId);
    if (ev && !disclosureAllowed(ev.disclosure, effectiveCap)) {
      findings.push({
        check: 'disclosure-bound',
        severity: 'fail',
        detail: `${h.eventId}: '${ev.disclosure}' evidence in a '${effectiveCap}' brief`,
      });
    }
  }
  return findings;
}

/**
 * Runs every certification check. Fails closed: any `fail` finding rejects
 * the brief. Does not mutate; the caller decides whether to downgrade
 * highlights and recompose.
 */
export function evaluateBrief(
  brief: ProofBrief,
  events: readonly ProofEvent[]
): CertificationFinding[] {
  return [
    ...checkTruthCurrent(brief, events),
    ...checkMeaningful(brief, events),
    ...checkUnderstandable(brief),
    ...checkNoOverclaim(brief, events),
    ...checkDenominators(brief, events),
    ...checkNoFiller(brief, events),
    ...checkNoMaterialOmission(brief, events),
    ...checkDisclosure(brief, events),
  ];
}

export function certify(
  brief: ProofBrief,
  events: readonly ProofEvent[],
  certifiedAt: string
): Certification {
  const findings = evaluateBrief(brief, events);
  return {
    result: findings.some(f => f.severity === 'fail')
      ? 'rejected'
      : 'certified',
    evaluatorVersion: CERTIFIER_VERSION,
    findings,
    certifiedAt,
  };
}
