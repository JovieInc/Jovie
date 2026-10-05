// Screen-mode coherence judge (JOV-7753, consumed by uiassure JOV-7713 and
// designgate). Pure functions only: the CLI run lives in judge.mjs.
//
// One screen (plus optional neighbor states for context) is scored on five
// dimensions. Scores are advisory; the verdict blocks only on a specific,
// located blocker finding, so a vague "feels off" can never fail a PR.

export const SCREEN_RUBRIC_VERSION = 'coherence-screen-v1';

export const SCREEN_DIMENSIONS = /** @type {const} */ ([
  'intent',
  'continuity',
  'subtraction',
  'seams',
  'inevitability',
]);

export const FINDING_SEVERITIES = /** @type {const} */ (['blocker', 'minor']);

export const SCREEN_ANCHORS = `Score each dimension 0-10 (0 = broken, 5 = acceptable, 10 = exemplary):
INTENT: the screen respects why the user is here. The first thing they see and the primary action serve that intention. A screen that ignores what the user already told us, or makes them restate it, scores low.
CONTINUITY: the screen agrees with where the user came from and with its neighbor states. Names, data, state and controls carry over. Anything the user can open they can close again the same way, and content does not swap out from under them.
SUBTRACTION: nothing could be removed without loss. Duplicate labels or values, repeated identity, redundant chrome and decorative filler score low.
SEAMS: no visible assembly. Clipping, overlap, misalignment, mismatched components, placeholder or debug text, and broken or empty media score low.
INEVITABILITY: the screen feels designed as one thing, not assembled from parts. Every element sits where you would expect it, and the layout reads in one pass.

Findings: report every concrete problem as { severity, dimension, location, detail }.
- "location" names the exact element or region (for example "library row 2, status column" or "sidebar header, toggle button"). Never leave it vague.
- A "blocker" is a specific, located defect a careful designer would refuse to ship:
  - the screen ignores the user's stated intent;
  - the same label or value is repeated side by side;
  - content or meaning swaps under the user between neighbor states;
  - a control that only works one way (it opens but cannot close, or hides but cannot show);
  - clipped or overlapping primary content;
  - a dead end with no next step.
- Everything else is "minor". Do not invent findings to fill the list; an excellent screen may have none.`;

/** JSON schema for one screen-mode run over one or more screens. */
export function buildScreenSchema(screenIds) {
  const dimensionScores = Object.fromEntries(
    SCREEN_DIMENSIONS.map(name => [
      name,
      { type: 'number', minimum: 0, maximum: 10 },
    ])
  );
  return {
    type: 'object',
    properties: {
      screens: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            screenId: { type: 'string', enum: screenIds },
            dimensions: {
              type: 'object',
              properties: dimensionScores,
              required: [...SCREEN_DIMENSIONS],
            },
            findings: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  severity: { type: 'string', enum: [...FINDING_SEVERITIES] },
                  dimension: { type: 'string', enum: [...SCREEN_DIMENSIONS] },
                  location: { type: 'string' },
                  detail: { type: 'string' },
                },
                required: ['severity', 'dimension', 'location', 'detail'],
              },
            },
            verdict: { type: 'string' },
          },
          required: ['screenId', 'dimensions', 'findings', 'verdict'],
        },
      },
    },
    required: ['screens'],
  };
}

/**
 * @typedef {{ id: string, label: string, images: string[], context?: string }} NeighborState
 * @typedef {{ id: string, label: string, context: string, images: string[], neighbors?: NeighborState[] }} ScreenInput
 */

/** @param {ScreenInput[]} screens */
export function buildScreenPrompt(screens) {
  const blocks = screens
    .map((screen, index) => {
      const lines = [
        `SCREEN ${index + 1} (${screen.id}): ${screen.label}`,
        `User intent and context: ${screen.context}`,
      ];
      for (const image of screen.images) lines.push(`Screenshot: ${image}`);
      for (const neighbor of screen.neighbors ?? []) {
        lines.push(
          `Neighbor state "${neighbor.label}" (${neighbor.id})${neighbor.context ? `: ${neighbor.context}` : ''}`
        );
        for (const image of neighbor.images)
          lines.push(`  Neighbor screenshot: ${image}`);
      }
      return lines.join('\n');
    })
    .join('\n\n');

  return `You are a senior product designer doing a coherence review of real screens from Jovie. Read every screenshot file listed (use the Read tool on each path), including neighbor states, before scoring. Judge each screen on its own, using its neighbors only as context for continuity. Judge only what is literally on screen.

The question for every screen: does it make sense, respect the user's intention, and feel inevitable rather than assembled?

${SCREEN_ANCHORS}

${blocks}

Return one entry per screen using the exact screenId values. "verdict" is one sentence a designer would say about the screen.`;
}

/** Throws on malformed output so a broken judge can never read as a pass. */
export function parseScreenOutput(raw, screenIds) {
  if (!raw || typeof raw !== 'object' || !Array.isArray(raw.screens)) {
    throw new Error('screen coherence output missing screens[]');
  }
  const screens = screenIds.map(screenId => {
    const row = raw.screens.find(item => item?.screenId === screenId);
    if (!row) throw new Error(`screen coherence output missing ${screenId}`);
    const dimensions = {};
    for (const name of SCREEN_DIMENSIONS) {
      const score = row.dimensions?.[name];
      if (typeof score !== 'number' || score < 0 || score > 10) {
        throw new Error(`${screenId}: ${name} out of range`);
      }
      dimensions[name] = score;
    }
    const findings = (Array.isArray(row.findings) ? row.findings : []).map(
      item => {
        if (!FINDING_SEVERITIES.includes(item?.severity)) {
          throw new Error(`${screenId}: unknown severity ${item?.severity}`);
        }
        if (!SCREEN_DIMENSIONS.includes(item?.dimension)) {
          throw new Error(`${screenId}: unknown dimension ${item?.dimension}`);
        }
        return {
          severity: item.severity,
          dimension: item.dimension,
          location: String(item.location ?? '').trim(),
          detail: String(item.detail ?? '').trim(),
        };
      }
    );
    return {
      screenId,
      dimensions,
      findings,
      verdict: String(row.verdict ?? ''),
    };
  });
  return { screens };
}

/**
 * A finding blocks only when it is a blocker that names both where and what.
 * Unlocated blockers are reported but never block.
 */
export function isBlockingFinding(finding) {
  return (
    finding.severity === 'blocker' &&
    finding.location.length > 0 &&
    finding.detail.length > 0
  );
}

/**
 * @param {{ screens: Array<{ screenId: string, dimensions: Record<string, number>, findings: Array<any> }> } | null} result
 * @returns {{ pass: boolean, failures: string[], unlocated: string[], screens: Array<{ screenId: string, pass: boolean, blocking: any[] }> }}
 */
export function evaluateScreenCoherence(result) {
  if (!result) {
    return {
      pass: false,
      failures: ['screen coherence not judged'],
      unlocated: [],
      screens: [],
    };
  }
  const failures = [];
  const unlocated = [];
  const screens = result.screens.map(screen => {
    const blocking = screen.findings.filter(isBlockingFinding);
    for (const finding of blocking) {
      failures.push(
        `${screen.screenId} ${finding.dimension} @ ${finding.location}: ${finding.detail}`
      );
    }
    for (const finding of screen.findings) {
      if (finding.severity === 'blocker' && !isBlockingFinding(finding)) {
        unlocated.push(
          `${screen.screenId} ${finding.dimension}: ${finding.detail}`
        );
      }
    }
    return { screenId: screen.screenId, pass: blocking.length === 0, blocking };
  });
  return { pass: failures.length === 0, failures, unlocated, screens };
}

/**
 * Calibration: every known escape must FAIL and every good neighbor must
 * PASS. A judge that misses either is not trusted to gate.
 *
 * @param {Array<{ id: string, expect: string }>} fixtures expect is 'pass' or 'fail'
 * @param {ReturnType<typeof evaluateScreenCoherence>} evaluation
 */
export function screenCalibrationMisses(fixtures, evaluation) {
  const byId = new Map(evaluation.screens.map(row => [row.screenId, row]));
  const misses = [];
  for (const fixture of fixtures) {
    const row = byId.get(fixture.id);
    if (!row) {
      misses.push(`${fixture.id}: not judged`);
      continue;
    }
    const got = row.pass ? 'pass' : 'fail';
    if (got !== fixture.expect) {
      misses.push(`${fixture.id}: expected ${fixture.expect}, got ${got}`);
    }
  }
  return misses;
}
