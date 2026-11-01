// Tim-taste rubric for the LLM dogfood judge. Pure data and functions only:
// ingest, model calls and reporting live in sibling modules.
//
// Each criterion cites anti-slop rule ids (docs/design-system/anti-slop-rules.json)
// instead of copying their statements; the prompt resolves the statements from
// the registry at run time so the registry stays the one source of truth.
// Examples come from Tim's own rejections (memory feedback_*.md, taste labels,
// the 2026-10-29 waitlist walkthrough and app-shell before/afters).

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

export const RUBRIC_VERSION = 'tim-taste-rubric/2026-10-29.2';
export const SEVERITIES = /** @type {const} */ (['blocker', 'major', 'minor']);

const ASR_REGISTRY = fileURLToPath(
  new URL('../../docs/design-system/anti-slop-rules.json', import.meta.url)
);

/**
 * Ordered by how often Tim has had to say it himself (the "obvious" set first).
 * `fail` and `pass` are short, concrete examples the judge can pattern-match.
 */
export const CRITERIA = Object.freeze([
  {
    id: 'TT-01',
    slug: 'pen-bar',
    title: 'Meets the Pen canonical design',
    asr: ['ASR-030'],
    severity: 'blocker',
    look: 'Compare the run frame with its Pen reference. Fail when the composition, hierarchy or component set is a different, weaker design (for example a lone card where Pen shows chat plus a live profile), not when only copy or data differ.',
    fail: [
      'Waitlist end state is a centered bordered card in an empty page; Pen R6As7U shows the chat with the draft profile taking shape beside it.',
      'App-shell after shots that Tim rejected: "why am i looking at a screenshot that doesnt even pass our invariants for design".',
    ],
    pass: [
      'Same layout regions, type roles and component masters as the Pen frame, with real user data.',
    ],
  },
  {
    id: 'TT-02',
    slug: 'no-internal-leak',
    title: 'No internal, test or pipeline data on screen',
    asr: ['ASR-042'],
    severity: 'blocker',
    look: 'Read every visible string. Fail on pipeline words (enrichment, source:, payload, token, webhook), route paths like /start, ids, synthetic or test emails, and raw URLs used as content.',
    fail: [
      '"201 Spotify followers (source: enrichment)" under the profile preview.',
      '"Watch browse-ready+synthetic-prodcert-wlcert1029a@jov.ie for the access email."',
      '"Resume anytime at /start".',
    ],
    pass: ['"We will email you at the address you signed up with."'],
  },
  {
    id: 'TT-03',
    slug: 'value-before-price',
    title: 'Value before price',
    asr: ['ASR-044'],
    severity: 'blocker',
    look: 'Fail when a price, plan or upgrade CTA appears before the person has seen value built from their own data, or on any waitlist, reservation or confirmation receipt.',
    fail: [
      '"Start Pro ($12)" as the primary button on the "You\'re on the list" receipt.',
    ],
    pass: [
      'The receipt shows what is reserved and what happens next; pricing appears after the profile is live.',
    ],
  },
  {
    id: 'TT-04',
    slug: 'no-dead-ends',
    title: 'No dead ends; the user is heard',
    asr: ['ASR-043'],
    severity: 'blocker',
    look: 'Fail when a state has no working next step, a control cannot work, a message says unavailable or coming soon, or the product ignores or contradicts what the user just typed.',
    fail: [
      'User types a different handle in chat; the reply repeats "Claiming @unmarked" and Confirm stays disabled.',
      '"Dictation isn\'t available… use macOS dictation".',
    ],
    pass: ['Typed handle is checked and reflected in the preview immediately.'],
  },
  {
    id: 'TT-05',
    slug: 'no-placeholder-or-stale',
    title: 'No placeholder or contradictory state',
    asr: ['ASR-047'],
    severity: 'blocker',
    look: 'Fail on placeholder values (your-handle, sample, lorem), empty or broken media, and states that contradict each other across frames (available then not available).',
    fail: [
      'Profile preview reads "jov.ie/your-handle" after the artist was matched.',
      'Handle shows available, then not available after reload.',
    ],
    pass: ['Preview shows the proposed real handle and keeps it stable.'],
  },
  {
    id: 'TT-06',
    slug: 'no-tiles-or-lone-cards',
    title: 'No icon tiles, bordered wrapper cards or nested boxes',
    asr: ['ASR-040', 'ASR-021', 'ASR-002', 'ASR-035'],
    severity: 'major',
    look: 'Fail on icons or emoji inside a bordered or filled circle or square, a bordered card wrapping a lone message or form in an empty page, boxes inside boxes, and repeated chrome the container already provides.',
    fail: [
      'Clock icon in a bordered circle beside "You\'re on the list", inside a bordered card centered in a black page.',
    ],
    pass: [
      'Bare 16px icon aligned to the text cap height; content sits on the surface without its own frame.',
    ],
  },
  {
    id: 'TT-07',
    slug: 'matte-monochrome',
    title: 'Matte, near-monochrome, color as accent',
    asr: ['ASR-010', 'ASR-011', 'ASR-012', 'ASR-032'],
    severity: 'major',
    look: 'Fail on full-bleed color, glossy or specular glass, colored glow washes behind content, more than one accent per surface, and off-token color. Pass near-black matte surfaces with depth from tonal steps.',
    fail: [
      'Purple glow wash behind the phone preview frame.',
      'Slow animated purple WebGL background on /smart-links.',
    ],
    pass: ['Near-black surface, one ion accent on the primary action.'],
  },
  {
    id: 'TT-08',
    slug: 'restrained-type-and-controls',
    title: 'Linear precision: restrained type, sentence case, quiet controls',
    asr: ['ASR-025', 'ASR-041', 'ASR-022', 'ASR-005'],
    severity: 'major',
    look: 'Fail on oversized headlines or text tabs, Title Case labels and buttons, all-caps eyebrows by default, text under 12px, default-disabled grey primary buttons and stacked title/subtitle/label/helper layers.',
    fail: [
      '"Resume At Start" Title Case button.',
      'Billboard-size marketing headline Tim called the "consumer oversized everything trap".',
    ],
    pass: [
      'Sentence-case labels, one heading size step above body, one microcopy line.',
    ],
  },
  {
    id: 'TT-09',
    slug: 'optical-alignment',
    title: 'Optical and grid alignment',
    asr: ['ASR-029'],
    severity: 'major',
    look: 'Fail on visibly misaligned shared edges, uneven gutters, icons off the text cap height, off-center elements in a centered column and uneven row rhythm.',
    fail: [
      'Chat column left edge does not align with the composer; reply text starts at a different x than the user bubble region.',
    ],
    pass: [
      'Every column shares one left edge; icon centers sit on the text cap height.',
    ],
  },
  {
    id: 'TT-10',
    slug: 'one-right-thing',
    title: 'One right thing, no dead space',
    asr: ['ASR-045', 'ASR-020'],
    severity: 'major',
    look: 'Fail when the screen has no single focal point, competing primary actions, or a small focal element lost in large empty regions (more than about half the viewport empty with nothing intentional).',
    fail: [
      'One line of chat text at the top and an empty two-thirds of the chat column above the composer.',
      'Two pill buttons of equal weight on a receipt.',
    ],
    pass: ['One focal element with one primary action, the rest quiet.'],
  },
  {
    id: 'TT-11',
    slug: 'no-ai-slop-copy',
    title: 'No AI slop or filler copy',
    asr: ['ASR-019', 'ASR-017', 'ASR-034'],
    severity: 'major',
    look: 'Fail on filler, hedges, AI-writing tells, copy that reads like the brief or an engineering note, numbered instruction lists where one sentence would do, and stiff system voice.',
    fail: [
      '"Expected timing: a few days once capacity opens — not instant."',
      '"UNMARKED is the match. Enrichment shows 201 Spotify followers. Claim a handle next."',
    ],
    pass: ['"Found UNMARKED. Your page is ready to claim."'],
  },
  {
    id: 'TT-12',
    slug: 'agent-first-living-canvas',
    title: 'Agent-first, living canvas',
    asr: ['ASR-046', 'ASR-031'],
    severity: 'major',
    look: 'For setup, onboarding and admin flows: fail when the person fills forms or widgets the agent could infer, when the result is not visibly taking shape live, or when the conversation goes quiet with no visible progress.',
    fail: [
      'Handle must be fixed by editing a widget field after the chat ignored the typed handle.',
    ],
    pass: [
      'Agent proposes the handle, the live profile updates as the person answers.',
    ],
  },
  {
    id: 'TT-13',
    slug: 'no-fan-language',
    title: 'Audience, never "fan"',
    asr: ['ASR-028'],
    severity: 'blocker',
    look: 'Fail on the word fan or fans anywhere on screen in Jovie product or marketing copy.',
    fail: ['"Paste the full URL fans already use."'],
    pass: ['"Paste the link your audience already uses."'],
  },
  {
    id: 'TT-14',
    slug: 'premium-imagery',
    title: 'Premium imagery and no text on text',
    asr: ['ASR-023', 'ASR-024', 'ASR-026', 'ASR-013'],
    severity: 'major',
    look: 'Fail on music-cliche stock (mics, headphones, stages, crowds with phones), unapproved people, our text over artwork that has its own text, and fake product UI in images.',
    fail: [
      'Stage and mic hero Tim called "cheesy and cheap".',
      'Release title overlaid on lettered cover art.',
    ],
    pass: ['Square cover art with title and artist below it.'],
  },
  {
    id: 'TT-15',
    slug: 'continuity-and-trust',
    title: 'Continuity and trust between steps',
    asr: ['ASR-033', 'ASR-027'],
    severity: 'major',
    look: 'Across consecutive frames: fail when names, handles or data change unexpectedly (unmarked becomes unmarked1 without saying why), when invented proof or unregistered claims appear, or when a step loses what the user already gave.',
    fail: [
      'Handle flow confirmed @unmarked, the receipt says jov.ie/unmarked1 is yours.',
    ],
    pass: [
      'The handle confirmed in chat is the one shown on every later screen.',
    ],
  },
  {
    id: 'TT-16',
    slug: 'runtime-health',
    title: 'Runtime health visible to the user',
    asr: ['ASR-043'],
    severity: 'blocker',
    look: 'Fail on visible error text, error toasts, spinners that never resolve, blank frames mid-flow and layout shift that moves the thing the person was about to tap. Console errors are context; only what the user would notice fails.',
    fail: ['Blank white frame between OTP and landing.'],
    pass: ['Every frame shows settled, styled content.'],
  },
]);

export const CRITERION_IDS = CRITERIA.map(c => c.id);

let registryCache = null;
/** ASR id → { title, statement } from the canonical registry. */
export function readAsrStatements(path = ASR_REGISTRY) {
  if (registryCache && path === ASR_REGISTRY) return registryCache;
  const reg = JSON.parse(readFileSync(path, 'utf8'));
  const map = new Map(
    reg.rules.map(rule => [
      rule.id,
      { title: rule.title, statement: rule.statement },
    ])
  );
  if (path === ASR_REGISTRY) registryCache = map;
  return map;
}

/** Every cited ASR id must exist; returns the missing ids. */
export function missingAsrRefs(asr = readAsrStatements()) {
  return [...new Set(CRITERIA.flatMap(c => c.asr))].filter(id => !asr.has(id));
}

export function renderRubric(asr = readAsrStatements()) {
  return CRITERIA.map(c => {
    const rules = c.asr
      .map(id => `    ${id} ${asr.get(id)?.statement ?? '(missing rule)'}`)
      .join('\n');
    return [
      `${c.id} ${c.title} [default severity: ${c.severity}]`,
      `  Look: ${c.look}`,
      `  Rules:\n${rules}`,
      `  Fails like: ${c.fail.map(f => `"${f}"`).join(' | ')}`,
      `  Passes like: ${c.pass.map(f => `"${f}"`).join(' | ')}`,
    ].join('\n');
  }).join('\n\n');
}

/** Verdict rule: one blocker, or two majors, fails a step. */
export function stepVerdict(findings) {
  const blockers = findings.filter(f => f.severity === 'blocker').length;
  const majors = findings.filter(f => f.severity === 'major').length;
  return blockers > 0 || majors >= 2 ? 'fail' : 'pass';
}

export function runVerdict(steps) {
  if (steps.length === 0) return 'fail';
  return steps.every(step => step.verdict === 'pass') ? 'pass' : 'fail';
}

/** JSON schema handed to `claude -p --json-schema`. */
export function buildJudgeSchema(stepIds, imageNames) {
  const bbox = {
    type: 'array',
    items: { type: 'number', minimum: 0, maximum: 1 },
    minItems: 4,
    maxItems: 4,
  };
  return {
    type: 'object',
    properties: {
      steps: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            stepId: { type: 'string', enum: stepIds },
            findings: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  criterion: { type: 'string', enum: CRITERION_IDS },
                  severity: { type: 'string', enum: [...SEVERITIES] },
                  image: { type: 'string', enum: [...new Set(imageNames)] },
                  bbox,
                  evidence: { type: 'string' },
                  detail: { type: 'string' },
                  fix: { type: 'string' },
                },
                required: [
                  'criterion',
                  'severity',
                  'image',
                  'bbox',
                  'evidence',
                  'detail',
                  'fix',
                ],
              },
            },
            penGap: { type: 'number', minimum: 0, maximum: 10 },
            penSummary: { type: 'string' },
            timQuote: { type: 'string' },
          },
          required: ['stepId', 'findings', 'penGap', 'penSummary', 'timQuote'],
        },
      },
      overall: { type: 'string' },
    },
    required: ['steps', 'overall'],
  };
}

/**
 * @param {{ surface: string, steps: Array<{ id: string, title: string, url?: string|null, images: Array<{ name: string, path: string, t?: number|null }>, text?: string, console?: string }>, penRefs: Array<{ id: string, title: string, path: string }>, tier: 'screen' | 'confirm', prior?: any }} input
 */
export function buildJudgePrompt({ surface, steps, penRefs, tier, prior }) {
  const stepBlocks = steps
    .map(step => {
      const lines = [
        `STEP ${step.id}: ${step.title}${step.url ? ` (${step.url})` : ''}`,
      ];
      for (const image of step.images) {
        lines.push(
          `  image ${image.name}${image.t == null ? '' : ` @ ${image.t.toFixed(1)}s`}: ${image.path}`
        );
      }
      if (step.text)
        lines.push(`  Visible text / AX excerpt:\n"""\n${step.text}\n"""`);
      if (step.console) lines.push(`  Console/network notes: ${step.console}`);
      return lines.join('\n');
    })
    .join('\n\n');
  const penBlock = penRefs.length
    ? penRefs.map(ref => `  ${ref.id} ${ref.title}: ${ref.path}`).join('\n')
    : '  (no Pen reference registered: judge TT-01 against the rubric bar only)';
  const tierLine =
    tier === 'confirm'
      ? `You are the confirming judge. A cheaper screen judge flagged the steps below. Re-check each finding against the pixels: keep it only if it is real, correct its severity, and add anything it missed. Its findings:\n${JSON.stringify(prior ?? {}, null, 1)}`
      : 'You are the screening judge. Report every real finding; the confirming judge removes false ones.';

  return `You are Tim White, founder of Jovie, reviewing a recorded agent walkthrough of "${surface}" before it may reach a real person. You have an Apple/Linear bar and you hate having to point out the obvious. Judge what is literally on screen, the way you would watch the video, not whether the test passed.

Open every image path listed (use the Read tool) before judging a step, including the Pen references. The Pen frames are the design bar: the run must match or beat them.

Rubric (${RUBRIC_VERSION}):
${renderRubric()}

Pen references for this surface:
${penBlock}

Run steps:
${stepBlocks}

${tierLine}

Output rules:
- One entry per step, using the exact stepId values.
- Each finding names one criterion id, a severity (blocker, major or minor), the image it is visible in, and a bbox [x, y, width, height] as fractions (0-1) of that image locating the problem tightly.
- "evidence" quotes the on-screen text or names the element; "detail" says what is wrong in one sentence; "fix" says the smallest change that would pass.
- Use the criterion's default severity unless the evidence is clearly weaker or stronger.
- penGap: 0 = matches or beats Pen, 10 = a different, much weaker design. penSummary: one sentence on the main gap.
- timQuote: the blunt one-line reaction you would text about this step.
- Calibrate to the Pen frames: a screen that matches its Pen reference with real data passes TT-01 and should carry at most minor findings. Text that annotates a design frame (state labels outside the product UI) is not product copy.
- Do not invent findings to fill a list. Do not pass a step out of politeness.`;
}

/**
 * Coerce a judge envelope's structured output into steps with verdicts.
 * Throws on a malformed or incomplete result so a broken judge never passes.
 */
export function parseJudgeOutput(raw, stepIds) {
  if (!raw || typeof raw !== 'object' || !Array.isArray(raw.steps)) {
    throw new Error('judge output missing steps[]');
  }
  const byId = new Map(raw.steps.map(step => [step.stepId, step]));
  const steps = stepIds.map(stepId => {
    const step = byId.get(stepId);
    if (!step) throw new Error(`judge output missing step ${stepId}`);
    if (!Array.isArray(step.findings)) {
      throw new Error(`step ${stepId}: findings must be an array`);
    }
    const findings = step.findings.map((finding, index) => {
      if (!CRITERION_IDS.includes(finding.criterion)) {
        throw new Error(`step ${stepId} finding ${index}: unknown criterion`);
      }
      if (!SEVERITIES.includes(finding.severity)) {
        throw new Error(`step ${stepId} finding ${index}: unknown severity`);
      }
      const bbox = Array.isArray(finding.bbox) ? finding.bbox.map(Number) : [];
      if (
        bbox.length !== 4 ||
        bbox.some(v => !Number.isFinite(v) || v < 0 || v > 1)
      ) {
        throw new Error(
          `step ${stepId} finding ${index}: bbox must be 4 fractions`
        );
      }
      return { ...finding, bbox };
    });
    return {
      stepId,
      findings,
      penGap: Number(step.penGap),
      penSummary: String(step.penSummary ?? ''),
      timQuote: String(step.timQuote ?? ''),
      verdict: stepVerdict(findings),
    };
  });
  return {
    steps,
    overall: String(raw.overall ?? ''),
    verdict: runVerdict(steps),
  };
}

// ---------------------------------------------------------------------------
// Cold screenshot test (Tim, 2026-10-29): "if I can screenshot and send it to
// you without any comments and you can immediately tell me what's wrong, then
// it's not ready." A strong vision model sees only the image, no rubric, no
// context, and is asked what is wrong. Any credible finding fails the step.
// ---------------------------------------------------------------------------

export const COLD_PASS_VERSION = 'cold-screenshot/2026-10-29.2';

export function buildColdSchema(imageNames) {
  return {
    type: 'object',
    properties: {
      images: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            image: { type: 'string', enum: [...new Set(imageNames)] },
            issues: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  credible: { type: 'boolean' },
                  severity: { type: 'string', enum: [...SEVERITIES] },
                  bbox: {
                    type: 'array',
                    items: { type: 'number', minimum: 0, maximum: 1 },
                    minItems: 4,
                    maxItems: 4,
                  },
                  detail: { type: 'string' },
                },
                required: ['credible', 'severity', 'bbox', 'detail'],
              },
            },
          },
          required: ['image', 'issues'],
        },
      },
    },
    required: ['images'],
  };
}

/** No rubric, no product context: the bar is what a sharp designer sees cold. */
export function buildColdPrompt(images) {
  const list = images.map(image => `  ${image.name}: ${image.path}`).join('\n');
  return `Someone sent you these screenshots with no comment. For each one, open it (use the Read tool) and tell them what's wrong with it.

${list}

Judge each image on its own. List what is wrong with it: visual, copy, layout, broken or confusing states, anything that looks unfinished or untrustworthy.
- credible: true only if it is obvious: something you would point out within a few seconds of looking, without hunting, zooming or knowing how the product works, and that a careful designer would agree is wrong rather than a matter of preference. Polish ideas, pixel nitpicks, guesses about states you cannot see, and annotation labels outside the product UI are credible: false.
- severity: blocker (they would not ship it), major (clearly wrong), minor (polish).
- bbox: [x, y, width, height] as fractions of that image.
- Many good screens have nothing obviously wrong. Then return an empty issues list for that image. Do not invent issues.`;
}

/** Validate the cold pass output; every image must be answered. */
export function parseColdOutput(raw, imageNames) {
  if (!raw || !Array.isArray(raw.images))
    throw new Error('cold output missing images[]');
  const byImage = new Map(raw.images.map(entry => [entry.image, entry]));
  return imageNames.map(name => {
    const entry = byImage.get(name);
    if (!entry || !Array.isArray(entry.issues))
      throw new Error(`cold output missing image ${name}`);
    const issues = entry.issues.map(issue => {
      const bbox = Array.isArray(issue.bbox) ? issue.bbox.map(Number) : [];
      if (
        bbox.length !== 4 ||
        bbox.some(v => !Number.isFinite(v) || v < 0 || v > 1)
      ) {
        throw new Error(`cold ${name}: bbox must be 4 fractions`);
      }
      if (!SEVERITIES.includes(issue.severity))
        throw new Error(`cold ${name}: bad severity`);
      return {
        credible: Boolean(issue.credible),
        severity: issue.severity,
        bbox,
        detail: String(issue.detail ?? ''),
      };
    });
    return { image: name, issues };
  });
}

/** Tim's bar: any credible cold issue is a fail, whatever its severity. */
export function coldFails(issues) {
  return issues.some(issue => issue.credible);
}
