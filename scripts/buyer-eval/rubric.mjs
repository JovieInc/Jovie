// Buyer-eval rubric (decisions/company/buyer-eval-gate-2026-10-31). Pure
// functions only: walk ingest, model transport and the CLI live elsewhere so
// this module stays unit-testable. Extends scripts/funnel-judge (JOV-7753):
// the outcome is a paid conversion at the real price (outcome.mjs), the answer
// is a calibrated probability with timestamped objections, not a boolean.

import { describeOutcome } from './outcome.mjs';

export const RUBRIC_VERSION = 'buyer-eval-rubric-v2';
export const RECEIPT_SCHEMA = 'jovie.buyer-eval-receipt/v1';

/** Strong-tier verdict thresholds (policy until real outcomes calibrate them). */
/**
 * Strong-tier thresholds. With zero positive labels these are POLICY, not
 * calibrated probabilities (adversarial review 2026-10-31 #2): resolve each
 * admitted user's 14-day outcome and re-fit once labels exist.
 */
export const THRESHOLDS = Object.freeze({
  pay: 0.6, // median p(pay) at or above (plus every coherent sample >= payFloor) => pay
  payFloor: 0.5, // lower bound: no coherent sample may sit below this for a pay
  readyMargin: 0.05, // hysteresis: entering "ready" needs pay + margin; leaving needs < pay
  noPay: 0.3, // median below => no_pay; between => abstain (borderline)
  maxSpread: 0.25, // max-min across coherent samples above this => abstain
  minCoherentSamples: 2,
  blockerCap: 0.2, // a sample that names a blocker objection is capped here
  minVotesToFile: 2, // an objection becomes a fix item only when >= this many samples raise it
  holdoutMaxP: 0.3, // a known-bad holdout must score below this
});

export const OBJECTION_CATEGORIES = /** @type {const} */ ([
  'no_value_shown', // nothing about me, or nothing I want
  'price_vs_value', // value shown does not justify the price
  'try_before_pay', // asked to pay before seeing it work
  'trust', // feels fake, unverified claims, broken, spammy
  'confusing', // do not know what it is or what to do
  'friction', // too much work before value
  'wrong_fit', // not for someone like me
  'contradiction', // price, plan, name or promise changes between steps
  'defect', // error, placeholder, dead end, internal jargon
]);

/**
 * Tier A archetypes. Briefs carry facts, budget and current tools only, never
 * Jovie features, so the persona does not "want" what the product sells.
 * `control: true` personas are off-ICP and must come out no_pay.
 */
export const ARCHETYPES = Object.freeze([
  {
    id: 'working-artist',
    brief:
      'Independent artist who earns a living from music: about 80k monthly Spotify listeners, tours regionally, sells merch, releases every 6-8 weeks. Spends about $250/month on software (distribution, mailing list, design, a link page). Very busy; buys tools that visibly earn or save more than they cost, and cancels ones that do not.',
  },
  {
    id: 'manager',
    brief:
      'Artist manager with 4 artists between 20k and 400k monthly listeners. Runs release calendars in spreadsheets and DMs. Pays for team tools when they save hours each week or catch missed revenue. Needs it to work across several artists, not just one.',
  },
  {
    id: 'creator-entrepreneur',
    brief:
      'Creator who launches things for a living: a podcast with 60k subscribers, a YouTube channel, a merch line and paid sponsorships. Uses several paid tools (Beacons, ConvertKit, Shopify). Not a musician. Pays for anything that clearly moves revenue.',
  },
  {
    id: 'skeptic',
    brief:
      'Artist with 15k monthly listeners who has paid for two link-in-bio and pre-save tools and saw no measurable lift. Distrusts AI hype and fake urgency. Converts only on concrete proof about their own career, shown before paying.',
  },
  {
    // Tim 2026-11-02: "im not gonna be able to get the bands to do this til
    // the product is pretty". Certification needs this buyer too (gate.mjs
    // REQUIRED_PERSONAS, ratcheted).
    id: 'heritage-rock-manager',
    brief:
      'Tour and artist manager for a multi-platinum heritage rock band (catalog from the 1970s to now, millions of monthly listeners, arena tours, a label and a business manager). Answers to the band members, who are protective of their brand. Budget is not the constraint: any tool shown to the band must look premium and polished, be trustworthy with their catalog and fans, and never look cheap, broken, generic or unfinished. One rough edge means it never gets shown to the band.',
  },
  {
    id: 'control-link-in-bio',
    control: true,
    brief:
      'Small online seller with no music, video or podcast. Wants a free link-in-bio page in two minutes. Has never paid for software and will not.',
  },
]);

/** Tier B: a persona built only from public verified artist data. No PII fields allowed. */
export const PUBLIC_PERSONA_FIELDS = Object.freeze([
  'genre',
  'followerBucket',
  'monthlyListenerBucket',
  'catalogSize',
  'releaseCadence',
  'latestReleaseAgeDays',
  'publicLinkKinds',
  'market',
]);

export function bucket(n) {
  if (!Number.isFinite(n)) return 'unknown';
  if (n < 100) return 'under 100';
  if (n < 1_000) return '100-1k';
  if (n < 10_000) return '1k-10k';
  if (n < 100_000) return '10k-100k';
  return '100k+';
}

/** Build a Tier B brief from public fields; throws on any non-public key. */
export function publicPersonaBrief(facts) {
  for (const key of Object.keys(facts)) {
    if (!PUBLIC_PERSONA_FIELDS.includes(key)) {
      throw new Error(`persona field not allowed (public data only): ${key}`);
    }
  }
  const parts = [
    `Artist in ${facts.genre ?? 'an unknown genre'}`,
    facts.market ? `based in ${facts.market}` : null,
    `with ${facts.followerBucket ?? 'unknown'} Spotify followers`,
    facts.monthlyListenerBucket
      ? `and ${facts.monthlyListenerBucket} monthly listeners`
      : null,
  ].filter(Boolean);
  const catalog =
    facts.catalogSize != null
      ? ` Public catalog: ${facts.catalogSize} releases${facts.releaseCadence ? `, releasing ${facts.releaseCadence}` : ''}${facts.latestReleaseAgeDays != null ? `, latest ${facts.latestReleaseAgeDays} days ago` : ''}.`
      : '';
  const links = facts.publicLinkKinds?.length
    ? ` Public presence: ${facts.publicLinkKinds.join(', ')}.`
    : '';
  return `${parts.join(' ')}.${catalog}${links} Budget and willingness to pay for software are unknown: infer them only from these facts.`;
}

/**
 * Forecaster prompt. The judge predicts a real person's behavior; it is not
 * asked to role-play a polite yes. Objections are written before the number.
 */
export function buildBuyerPrompt({
  persona,
  outcome,
  steps,
  standIn = false,
  note = '',
}) {
  const stepBlocks = steps
    .map(step => {
      const lines = [
        `STEP ${step.stepId} at ${step.tSec.toFixed(1)}s: ${step.title}`,
      ];
      if (step.text) lines.push(`Visible text:\n"""\n${step.text}\n"""`);
      return lines.join('\n');
    })
    .join('\n\n');
  return `You are a conversion forecaster. You are shown a screen recording (as attached frames plus visible text) of one person's session on Jovie, in order. Predict that person's real behavior.

The person: ${persona.brief}
${
  standIn
    ? "The artist shown on screen is a STAND-IN account used to record the session. Judge the product, flow, offer and how it treats the artist's data; do not count differences between the stand-in's numbers (followers, listeners, catalog) and this person's as an objection."
    : "The name, handle and data on screen are this person's own."
}

${describeOutcome(outcome)}

Calibration facts you must respect:
- This person signed up on purpose, so they have some intent. Still, most self-serve signups never pay: qualified trial users usually convert well under 50%, and a free plan that stays free forever is always the alternative. Predict paying INSTEAD OF staying free.
- Only what is literally on screen counts. Do not credit features that are promised, implied or "probably there". A payment ask before the person has seen value about themselves counts against it.
- Placeholder text, internal jargon, errors, a price that changes, or a paid ask while the person is told they are waitlisted are trust breakers.
- Unverifiable marketing claims (guaranteed growth, "10x streams") lower trust; they do not raise p.
- Look at every attached image before answering. Each image is labelled with the step(s) it shows; a sheet stacks consecutive steps top to bottom.

Work in this order:
1. objections: the 3 strongest reasons this person would NOT pay, each tied to the stepId where it happens (the step where the person would feel it), with a category.
2. valueEvidence: stepIds where value specific to this person was literally shown, and what it was (empty if none).
3. pPay: probability (0-1) of the outcome above. pPay3x: the same at 3x the price (must not exceed pPay).
4. flipToPay: up to 3 concrete PRODUCT changes (capability, proof on their own data, offer or flow) that would most raise pPay, each tied to the objection it removes. Copy that only asserts value does not count.
${note ? `\n${note}\n` : ''}
${stepBlocks}`;
}

export function buildBuyerSchema(stepIds) {
  return {
    type: 'object',
    properties: {
      objections: {
        type: 'array',
        minItems: 1,
        maxItems: 3,
        items: {
          type: 'object',
          properties: {
            text: { type: 'string' },
            stepId: { type: 'string', enum: stepIds },
            category: { type: 'string', enum: [...OBJECTION_CATEGORIES] },
            severity: { type: 'string', enum: ['blocker', 'major', 'minor'] },
          },
          required: ['text', 'stepId', 'category', 'severity'],
        },
      },
      valueEvidence: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            stepId: { type: 'string', enum: stepIds },
            what: { type: 'string' },
          },
          required: ['stepId', 'what'],
        },
      },
      pPay: { type: 'number', minimum: 0, maximum: 1 },
      pPay3x: { type: 'number', minimum: 0, maximum: 1 },
      flipToPay: {
        type: 'array',
        maxItems: 3,
        items: {
          type: 'object',
          properties: {
            change: { type: 'string' },
            removesObjection: { type: 'integer', minimum: 1, maximum: 3 },
            kind: {
              type: 'string',
              enum: ['capability', 'proof', 'offer', 'flow', 'copy'],
            },
          },
          required: ['change', 'removesObjection', 'kind'],
        },
      },
    },
    required: ['objections', 'valueEvidence', 'pPay', 'pPay3x', 'flipToPay'],
  };
}

/**
 * Validate one sample. Timestamps come from the walk, never the model.
 * Throws on malformed output so a broken judge can never read as a pass.
 */
export function parseBuyerSample(raw, steps) {
  const byId = new Map(steps.map(step => [step.stepId, step]));
  if (!raw || typeof raw !== 'object') throw new Error('sample not an object');
  for (const key of ['pPay', 'pPay3x']) {
    if (typeof raw[key] !== 'number' || raw[key] < 0 || raw[key] > 1) {
      throw new Error(`${key} out of range`);
    }
  }
  if (!Array.isArray(raw.objections) || raw.objections.length === 0) {
    throw new Error('objections missing');
  }
  const objections = raw.objections.slice(0, 3).map(row => {
    const step = byId.get(row?.stepId);
    if (!step) throw new Error(`objection cites unknown step ${row?.stepId}`);
    if (!OBJECTION_CATEGORIES.includes(row.category)) {
      throw new Error(`unknown category ${row.category}`);
    }
    return {
      text: String(row.text ?? '').slice(0, 400),
      stepId: step.stepId,
      tSec: step.tSec,
      category: row.category,
      severity: ['blocker', 'major', 'minor'].includes(row.severity)
        ? row.severity
        : 'major',
    };
  });
  const valueEvidence = (raw.valueEvidence ?? [])
    .filter(row => byId.has(row?.stepId))
    .map(row => ({ stepId: row.stepId, what: String(row.what ?? '') }));
  const flipToPay = (raw.flipToPay ?? []).slice(0, 3).map(row => ({
    change: String(row?.change ?? ''),
    removesObjection: Number(row?.removesObjection) || null,
    kind: row?.kind ?? 'copy',
  }));
  // A judge that names a blocker and still forecasts a likely payment is
  // rationalizing (review #6): cap it.
  const hasBlocker = objections.some(row => row.severity === 'blocker');
  const pPay = hasBlocker
    ? Math.min(raw.pPay, THRESHOLDS.blockerCap)
    : raw.pPay;
  return {
    pPay,
    rawPPay: raw.pPay,
    capped: hasBlocker && raw.pPay > THRESHOLDS.blockerCap,
    pPay3x: raw.pPay3x,
    coherent: raw.pPay3x <= raw.pPay + 1e-9,
    objections,
    valueEvidence,
    flipToPay,
  };
}

const median = values => {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
};

/** Normalized key for clustering objections across samples. */
export function objectionKey(objection) {
  return `${objection.category}@${objection.stepId}`;
}

/**
 * Combine samples. Incoherent samples (p at 3x > p) are dropped. Objections
 * are ranked by how many samples raised the same category at the same step,
 * so a one-off invention does not outrank a repeated finding.
 */
export function aggregateSamples(samples, thresholds = THRESHOLDS) {
  const coherent = samples.filter(sample => sample.coherent);
  if (coherent.length < thresholds.minCoherentSamples) {
    return {
      verdict: 'abstain',
      reason: `only ${coherent.length} coherent samples`,
      pPay: null,
      spread: null,
      objections: [],
      flipToPay: [],
      valueEvidence: [],
      samples: samples.length,
      coherentSamples: coherent.length,
    };
  }
  const ps = coherent.map(sample => sample.pPay);
  const pPay = median(ps);
  const spread = Math.max(...ps) - Math.min(...ps);
  let verdict = 'abstain';
  let reason = 'borderline';
  if (spread > thresholds.maxSpread) reason = `spread ${spread.toFixed(2)}`;
  else if (pPay >= thresholds.pay && Math.min(...ps) >= thresholds.payFloor) {
    verdict = 'pay';
    reason = 'median and lower bound at or above pay threshold';
  } else if (pPay < thresholds.noPay) {
    verdict = 'no_pay';
    reason = 'median below no-pay threshold';
  }
  const clusters = new Map();
  for (const sample of coherent) {
    for (const objection of sample.objections) {
      const key = objectionKey(objection);
      const row = clusters.get(key) ?? { ...objection, votes: 0 };
      row.votes += 1;
      clusters.set(key, row);
    }
  }
  const severityRank = { blocker: 0, major: 1, minor: 2 };
  const objections = [...clusters.values()]
    .sort(
      (a, b) =>
        b.votes - a.votes ||
        severityRank[a.severity] - severityRank[b.severity] ||
        a.tSec - b.tSec
    )
    .slice(0, 3);
  const best = coherent.reduce((a, b) =>
    Math.abs(a.pPay - pPay) <= Math.abs(b.pPay - pPay) ? a : b
  );
  return {
    verdict,
    reason,
    pPay: Math.round(pPay * 1000) / 1000,
    spread: Math.round(spread * 1000) / 1000,
    objections,
    flipToPay: best.flipToPay.filter(row => row.kind !== 'copy'),
    valueEvidence: best.valueEvidence,
    samples: samples.length,
    coherentSamples: coherent.length,
  };
}

/**
 * Redact identity tokens (artist name, handle, email local part) from any
 * text that leaves the private persona store: receipts, signals, Linear.
 */
export function redact(text, identityTokens = []) {
  let out = String(text ?? '');
  out = out.replace(/[\w.+-]+@[\w-]+\.[\w.]+/gu, '{email}');
  const tokens = [...identityTokens]
    .filter(token => typeof token === 'string' && token.trim().length >= 3)
    .sort((a, b) => b.length - a.length);
  for (const token of tokens) {
    const escaped = token.trim().replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
    out = out.replace(new RegExp(escaped, 'giu'), '{artist}');
  }
  return out;
}

/** Objections that become fix items: repeated across samples, never one-offs. */
export function fileableObjections(result, thresholds = THRESHOLDS) {
  return result.objections.filter(
    row => row.votes >= thresholds.minVotesToFile
  );
}

/**
 * Hysteresis for the ready flag so a verdict near the threshold does not
 * flip-flop between runs: enter at pay + margin, stay while >= pay.
 */
export function readyFlag(result, wasReady = false, thresholds = THRESHOLDS) {
  if (result.verdict !== 'pay' || result.pPay === null) return false;
  return wasReady
    ? result.pPay >= thresholds.pay
    : result.pPay >= thresholds.pay + thresholds.readyMargin;
}

/**
 * Fail closed when any identity token survives into text that leaves the
 * private store (review #4). Use after redact(), before every write.
 */
export function assertNoIdentity(text, identityTokens = []) {
  const haystack = String(text ?? '').toLowerCase();
  for (const token of identityTokens) {
    if (typeof token !== 'string' || token.trim().length < 3) continue;
    if (haystack.includes(token.trim().toLowerCase())) {
      throw new Error('identity token present in outbound text; write blocked');
    }
  }
  if (/[\w.+-]+@[\w-]+\.[\w.]+/u.test(haystack)) {
    throw new Error('email present in outbound text; write blocked');
  }
  return text;
}

/** A known-bad holdout passes calibration only when it comes out a clear no. */
export function holdoutHolds(result, thresholds = THRESHOLDS) {
  return (
    result.verdict !== 'pay' &&
    result.pPay !== null &&
    result.pPay < thresholds.holdoutMaxP
  );
}

/** Objection recall against known real objections (category list). */
export function objectionRecall(objections, expectedCategories) {
  if (!expectedCategories.length) return 1;
  const got = new Set(objections.map(row => row.category));
  const hit = expectedCategories.filter(category => got.has(category));
  return hit.length / expectedCategories.length;
}
