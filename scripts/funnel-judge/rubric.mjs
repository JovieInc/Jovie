// Simulated-user conversion rubric for the outreach → claim → upgrade → first
// use funnel (JOV-7753). Pure functions only: capture and judge live in
// capture.mjs / judge.mjs so this module stays unit-testable.

export const RUBRIC_VERSION = 'funnel-judge-rubric-v1';

export const EMOTIONS = /** @type {const} */ ([
  'curious',
  'excited',
  'confused',
  'anxious',
  'bored',
  'distrustful',
]);

/**
 * ICP personas grounded in canon/POSITIONING.md ("musicians and other
 * creators managing a creative life with real work to move") and the
 * published Pro offer ($199/mo, lib/billing/offer-truth.ts).
 */
export const PERSONAS = [
  {
    id: 'indie-release',
    name: 'Maya',
    brief:
      'Independent R&B artist, about 5k monthly Spotify listeners, next single out in 3 weeks. Uses a free Linktree. Has a day job, so $199/mo has to visibly pay for itself in streams, fans or bookings.',
  },
  {
    id: 'manager',
    name: 'Dre',
    brief:
      'Manages 3 artists (20k to 150k monthly listeners). Lives in spreadsheets, DMs and release calendars. Pays for tools that save hours or catch missed opportunities. Wants to know it scales past one artist.',
  },
  {
    id: 'producer',
    name: 'Kenji',
    brief:
      'Producer and beatmaker with credits on other artists releases. Rarely the face of a release. Wants credit visibility and inbound placement requests. Unsure a profile product is for him.',
  },
  {
    id: 'skeptic',
    name: 'Sam',
    brief:
      'Artist with 12k monthly listeners who paid for two link-in-bio and pre-save tools and saw no lift. Distrusts AI hype and fake urgency. Converts only on concrete proof about their own career.',
  },
  {
    id: 'creator',
    name: 'Lena',
    brief:
      'Non-musician creator: YouTube and podcast host with 40k subscribers who sells merch and takes sponsorships. Uses Beacons. Needs to see that this is for creators, not only musicians.',
  },
];

/** Score anchors keep the judge strict; the blank /start must land at or below 3. */
export const SCORE_ANCHORS = `Score anchors (apply literally; do not grade on effort or polish alone):
VALUE SHOWN, "do I see something about ME that I want?"
  0-2: nothing about me; empty or generic screen.
  3-4: generic product claims or my typed name echoed back, no real data about me.
  5-6: my real name/photo/links shown, but no benefit or insight I care about.
  7-8: my real data shown with a concrete benefit I want (more fans, saved time, money).
  9-10: a specific insight or outcome about me I did not already know, backed by my data.
EMOTIONAL POSITIVITY: 0 = I want to leave; 5 = neutral; 10 = I am excited to continue.
CLARITY, "do I know what to do next?": 0 = no idea; 5 = I can guess; 10 = one obvious next action.
FRICTION (inverted, 10 = effortless): count fields, taps, waiting, and anything I must type before seeing value.
TRUST: 0 = feels like a scam or broken; 5 = neutral; 10 = real, specific, verifiable, professional.
WOULD CONTINUE: an honest yes/no for a busy person who did not ask for this. A blank or confusing step is a no.
WOULD PAY $199/month: answer only from what the flow has shown so far, not from what the product might do.`;

/** JSON schema handed to `claude -p --json-schema` for each persona run. */
export function buildJudgeSchema(stepIds) {
  const stepSchema = {
    type: 'object',
    properties: {
      stepId: { type: 'string', enum: stepIds },
      value: { type: 'number', minimum: 0, maximum: 10 },
      emotion: { type: 'string', enum: [...EMOTIONS] },
      positivity: { type: 'number', minimum: 0, maximum: 10 },
      clarity: { type: 'number', minimum: 0, maximum: 10 },
      friction: { type: 'number', minimum: 0, maximum: 10 },
      trust: { type: 'number', minimum: 0, maximum: 10 },
      wouldContinue: { type: 'boolean' },
      reason: { type: 'string' },
      quote: { type: 'string' },
    },
    required: [
      'stepId',
      'value',
      'emotion',
      'positivity',
      'clarity',
      'friction',
      'trust',
      'wouldContinue',
      'reason',
      'quote',
    ],
  };
  return {
    type: 'object',
    properties: {
      steps: { type: 'array', items: stepSchema },
      wouldPay: { type: 'boolean' },
      payReason: { type: 'string' },
    },
    required: ['steps', 'wouldPay', 'payReason'],
  };
}

/**
 * @param {{ id: string, name: string, brief: string }} persona
 * @param {Array<{ id: string, label: string, context: string, images: string[], text?: string, uncaptured?: string }>} steps
 * @param {'full' | 'emotional'} focus
 */
export function buildJudgePrompt(persona, steps, focus = 'full') {
  const stepBlocks = steps
    .map((step, index) => {
      const lines = [
        `STEP ${index + 1} (${step.id}): ${step.label}`,
        step.context,
      ];
      if (step.text) lines.push(`Text you received:\n"""\n${step.text}\n"""`);
      if (step.uncaptured) {
        lines.push(
          `This step could not be shown to you (${step.uncaptured}). Treat it as a blank or broken screen.`
        );
      }
      for (const image of step.images) lines.push(`Screenshot: ${image}`);
      return lines.join('\n');
    })
    .join('\n\n');

  const focusLine =
    focus === 'emotional'
      ? 'Your job in this pass is the emotional read: how each step makes you FEEL, moment to moment. Still fill every field.'
      : 'Judge value, clarity, friction, trust and emotion for every step.';

  return `You are ${persona.name}. ${persona.brief}

You are a simulated prospect walking a real product funnel for Jovie, in order. Read every screenshot file listed (use the Read tool on each path) before scoring a step. Desktop and mobile captures are the same step; judge the worse of the two. Treat the profile and handle shown as your own name and data. Judge only what is literally on screen; never assume features you were not shown. Be the honest, busy, slightly impatient person described above, not a polite reviewer.

${focusLine}

${SCORE_ANCHORS}

${stepBlocks}

Return one entry per step, in order, using the exact stepId values. "quote" is one blunt first-person sentence ${persona.name} would say about that step.`;
}

/**
 * Coerce a judge's structured output into the receipt shape. Throws on a
 * malformed or incomplete result so a broken judge can never read as a pass.
 */
export function parseJudgeOutput(raw, stepIds) {
  if (!raw || typeof raw !== 'object' || !Array.isArray(raw.steps)) {
    throw new Error('judge output missing steps[]');
  }
  const byId = new Map(raw.steps.map(step => [step.stepId, step]));
  const steps = stepIds.map(stepId => {
    const step = byId.get(stepId);
    if (!step) throw new Error(`judge output missing step ${stepId}`);
    for (const key of ['value', 'positivity', 'clarity', 'friction', 'trust']) {
      const score = step[key];
      if (typeof score !== 'number' || score < 0 || score > 10) {
        throw new Error(`step ${stepId}: ${key} out of range`);
      }
    }
    if (!EMOTIONS.includes(step.emotion)) {
      throw new Error(`step ${stepId}: unknown emotion ${step.emotion}`);
    }
    return {
      stepId,
      value: step.value,
      emotion: step.emotion,
      positivity: step.positivity,
      clarity: step.clarity,
      friction: step.friction,
      trust: step.trust,
      wouldContinue: step.wouldContinue === true,
      reason: String(step.reason ?? ''),
      quote: String(step.quote ?? ''),
    };
  });
  return {
    steps,
    wouldPay: raw.wouldPay === true,
    payReason: String(raw.payReason ?? ''),
  };
}

export const PASS_BAR = {
  minStepAverage: 7,
  minWouldPay: 4,
  maxMobileLcpMs: 2500,
  maxCls: 0,
};

const mean = values =>
  values.length === 0
    ? 0
    : values.reduce((sum, v) => sum + v, 0) / values.length;
const round1 = value => Math.round(value * 10) / 10;

/**
 * Average each step across every persona verdict (both judges count: the
 * emotional judge's positivity read is weighted the same as the primary's).
 *
 * @param {Array<{ personaId: string, judge: string, steps: Array<any> }>} verdicts
 * @param {string[]} stepIds
 */
export function aggregateSteps(verdicts, stepIds) {
  return stepIds.map(stepId => {
    const rows = verdicts
      .map(verdict => verdict.steps.find(step => step.stepId === stepId))
      .filter(Boolean);
    return {
      stepId,
      value: round1(mean(rows.map(row => row.value))),
      positivity: round1(mean(rows.map(row => row.positivity))),
      clarity: round1(mean(rows.map(row => row.clarity))),
      friction: round1(mean(rows.map(row => row.friction))),
      trust: round1(mean(rows.map(row => row.trust))),
      continueRate:
        Math.round(mean(rows.map(row => (row.wouldContinue ? 1 : 0))) * 100) /
        100,
    };
  });
}

/**
 * Apply the pass bar. Returns every failing reason so the loop can target the
 * worst step; `pass` is true only when the list is empty.
 *
 * @param {{
 *   stepIds: string[],
 *   verdicts: Array<{ personaId: string, judge: string, steps: Array<any>, wouldPay: boolean }>,
 *   primaryJudge: string,
 *   metrics: Array<{ stepId: string, viewport: string, lcpMs?: number | null, cls?: number | null, a11yBlockers?: number, uncaptured?: string }>,
 * }} input
 */
export function evaluatePassBar({ stepIds, verdicts, primaryJudge, metrics }) {
  /** @type {string[]} */
  const failures = [];
  const aggregates = aggregateSteps(verdicts, stepIds);

  for (const verdict of verdicts) {
    for (const step of verdict.steps) {
      if (!step.wouldContinue) {
        failures.push(
          `${verdict.personaId} (${verdict.judge}) stops at ${step.stepId}: ${step.reason}`
        );
      }
    }
  }

  const primary = verdicts.filter(verdict => verdict.judge === primaryJudge);
  const payers = primary.filter(verdict => verdict.wouldPay).length;
  if (payers < PASS_BAR.minWouldPay) {
    failures.push(
      `${payers}/${primary.length} personas would pay $199 (need ${PASS_BAR.minWouldPay})`
    );
  }

  for (const aggregate of aggregates) {
    for (const key of ['value', 'clarity', 'positivity']) {
      if (aggregate[key] < PASS_BAR.minStepAverage) {
        failures.push(
          `${aggregate.stepId} ${key} averages ${aggregate[key]} (< ${PASS_BAR.minStepAverage})`
        );
      }
    }
  }

  for (const metric of metrics) {
    const where = `${metric.stepId}@${metric.viewport}`;
    if (metric.uncaptured) {
      failures.push(`${where} not captured: ${metric.uncaptured}`);
      continue;
    }
    if (
      metric.viewport === 'mobile' &&
      (metric.lcpMs == null || metric.lcpMs > PASS_BAR.maxMobileLcpMs)
    ) {
      failures.push(
        `${where} LCP ${metric.lcpMs ?? 'unmeasured'}ms (> ${PASS_BAR.maxMobileLcpMs})`
      );
    }
    if (metric.cls == null || metric.cls > PASS_BAR.maxCls) {
      failures.push(
        `${where} CLS ${metric.cls ?? 'unmeasured'} (> ${PASS_BAR.maxCls})`
      );
    }
    if (metric.a11yBlockers > 0) {
      failures.push(
        `${where} has ${metric.a11yBlockers} accessibility blockers`
      );
    }
  }

  return { pass: failures.length === 0, failures, aggregates, payers };
}

/** The worst step is the lowest mean of value, clarity and positivity. */
export function worstStep(aggregates) {
  let worst = null;
  for (const aggregate of aggregates) {
    const score =
      (aggregate.value + aggregate.clarity + aggregate.positivity) / 3;
    if (!worst || score < worst.score)
      worst = { stepId: aggregate.stepId, score: round1(score) };
  }
  return worst;
}

/**
 * Calibration guard: Tim judged the blank /start "not up to standards"
 * (2026-10-03). A rubric that passes that capture is too lenient to trust.
 */
export function calibrationHolds(result, calibrationStepId) {
  const aggregate = result.aggregates.find(
    row => row.stepId === calibrationStepId
  );
  if (!aggregate) return false;
  return (
    !result.pass &&
    (aggregate.value < PASS_BAR.minStepAverage ||
      aggregate.clarity < PASS_BAR.minStepAverage ||
      aggregate.positivity < PASS_BAR.minStepAverage)
  );
}

/** One line per run for the committed trend file. */
export function trendLine(receipt) {
  return JSON.stringify({
    runId: receipt.runId,
    at: receipt.at,
    baseUrl: receipt.baseUrl,
    rubric: RUBRIC_VERSION,
    pass: receipt.result.pass,
    payers: receipt.result.payers,
    worst: worstStep(receipt.result.aggregates),
    steps: Object.fromEntries(
      receipt.result.aggregates.map(row => [
        row.stepId,
        { v: row.value, c: row.clarity, e: row.positivity },
      ])
    ),
  });
}
