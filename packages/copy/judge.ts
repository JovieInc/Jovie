import { type CopyLintResult, lintCopy } from './lint';
import type { CopyRegister } from './rules';

/**
 * Stakes tiers. Judge spend scales with how often the text runs and how much
 * it matters, never uniformly (founder direction 2026-09-25):
 *  - flagship: homepage, landing pages, launches, investor copy. Full
 *    cross-family panel plus rewrite loop.
 *  - standard: campaigns, founder drafts, blog. One cheap judge from a family
 *    other than the generator.
 *  - volume:   chat, inbox replies, anything ~500x/day. Deterministic lint only.
 */
export const COPY_TIERS = ['flagship', 'standard', 'volume'] as const;
export type CopyTier = (typeof COPY_TIERS)[number];

/**
 * Judge roster. Routes respect the founder gateway allowlist (2026-09-17):
 * only zai/* runs on the Vercel AI Gateway; anthropic/* runs on the Claude
 * Code CLI and openai/* on the Codex CLI, both on subscriptions. Order is
 * preference; unavailable or same-family-as-generator judges are skipped.
 * ponytail: static roster; the central model router can own it later.
 */
export const JUDGE_ROSTER: Readonly<Record<CopyTier, readonly string[]>> = {
  flagship: ['anthropic/claude-opus-5.5', 'openai/gpt-5.5', 'zai/glm-5.3'],
  standard: ['zai/glm-5.3-flash', 'anthropic/claude-sonnet-5'],
  volume: [],
};

const TIER_POLICY: Readonly<
  Record<
    CopyTier,
    { judges: number; minJudges: number; bar: number; maxRounds: number }
  >
> = {
  flagship: { judges: 3, minJudges: 2, bar: 8, maxRounds: 4 },
  standard: { judges: 1, minJudges: 1, bar: 7, maxRounds: 2 },
  volume: { judges: 0, minJudges: 0, bar: 0, maxRounds: 1 },
};

export const RUBRIC_VERSION = 'copy-rubric/1';
export const RUBRIC_DIMENSIONS = [
  'outcome', // leads with what the reader gets or can do
  'specificity', // concrete nouns, numbers, names over abstractions
  'economy', // every word earns its place
  'voice', // fits the register
  'truth', // every claim is supported by the supplied facts
  'safety', // no harm to customers, company, investors; legal and ToS clean
  'human', // no AI cadence: triple beats, symmetric contrasts, Q-then-A, mic-drop closers
] as const;
export type RubricDimension = (typeof RUBRIC_DIMENSIONS)[number];

export interface CopyBrief {
  readonly register: CopyRegister;
  readonly tier: CopyTier;
  /** Who reads it and what they should do next. */
  readonly audience: string;
  readonly goal: string;
  /** The only facts the copy may claim. Anything else is a truth failure. */
  readonly facts: readonly string[];
  /** Customer voice samples (customer-voice register only). */
  readonly voiceSamples?: readonly string[];
  /** Model that wrote the draft. Its family never judges its own output. */
  readonly generatorModel?: string;
}

export interface JudgeVerdict {
  readonly model: string;
  readonly scores: Readonly<Record<RubricDimension, number>>;
  readonly confidence: number;
  readonly pass: boolean;
  readonly critique: readonly string[];
}

/** Injected transport: send a prompt to a model, get its text back. */
export type JudgeTransport = ((request: {
  model: string;
  system: string;
  prompt: string;
}) => Promise<string>) & {
  /** Whether this transport can reach a model right now. Default: all. */
  available?: (model: string) => boolean;
};

export type CopyGateStatus = 'pass' | 'revise' | 'blocked';

export interface CopyGateResult {
  readonly status: CopyGateStatus;
  readonly lint: CopyLintResult;
  readonly verdicts: readonly JudgeVerdict[];
  /** Merged, deduplicated instructions for the next rewrite. */
  readonly critique: readonly string[];
}

const family = (model: string) => model.split('/')[0] ?? model;

export function selectJudges(
  tier: CopyTier,
  generatorModel?: string,
  available: (model: string) => boolean = () => true
): string[] {
  const excluded = generatorModel ? family(generatorModel) : undefined;
  return JUDGE_ROSTER[tier]
    .filter(model => family(model) !== excluded && available(model))
    .slice(0, TIER_POLICY[tier].judges);
}

const REGISTER_GUIDE: Readonly<Record<CopyRegister, string>> = {
  'jovie-marketing':
    'Apple-grade outcome copy. Lead with what the customer gets. Short declaratives. One idea per line. Proof over adjectives.',
  'jovie-product-ui':
    'Clear, concise interface text. Most important information first. Errors say what happened and what to do, never blame.',
  'jovie-transactional':
    'Plain, warm, brief. Subject says the point. One action per message.',
  'jovie-persona':
    'Jovie the character: warm to artists, ruthless to bad systems, opens with the take, specific, internet-native without trying.',
  'founder-tim':
    'Tim White: casual, direct, dry humor, one vivid example, leads with the reframe, short paragraphs. Swearing for emphasis is fine; never at a person.',
  'customer-voice':
    "The customer's own voice from the samples. Keep their slang and style. Do not impose Jovie house style.",
};

export function buildJudgePrompt(
  text: string,
  brief: CopyBrief
): { system: string; prompt: string } {
  const bar = TIER_POLICY[brief.tier].bar;
  const system = [
    'You are a senior copy chief reviewing copy before it ships. You are strict and specific.',
    `Score each dimension 1-10: ${RUBRIC_DIMENSIONS.join(', ')}.`,
    'truth: any claim not supported by FACTS scores <= 4. safety: any harm, legal, or platform-ToS risk to customers, the company, or investors scores <= 4.',
    'Do not reward length. Shorter wins when meaning is equal.',
    `pass = every dimension >= ${bar}.`,
    'Reply with JSON only: {"scores":{...},"confidence":0-1,"critique":["specific instruction", ...]}',
  ].join('\n');
  const prompt = [
    `REGISTER: ${brief.register}. ${REGISTER_GUIDE[brief.register]}`,
    `AUDIENCE: ${brief.audience}`,
    `GOAL: ${brief.goal}`,
    `FACTS:\n${brief.facts.map(fact => `- ${fact}`).join('\n') || '- (none supplied: any factual claim is unsupported)'}`,
    brief.voiceSamples?.length
      ? `VOICE SAMPLES:\n${brief.voiceSamples.join('\n---\n')}`
      : '',
    `COPY:\n<<<\n${text}\n>>>`,
  ]
    .filter(Boolean)
    .join('\n\n');
  return { system, prompt };
}

export function parseVerdict(
  model: string,
  raw: string,
  bar: number
): JudgeVerdict {
  const json = raw.slice(raw.indexOf('{'), raw.lastIndexOf('}') + 1);
  const parsed = JSON.parse(json) as {
    scores?: Partial<Record<RubricDimension, number>>;
    confidence?: number;
    critique?: string[];
  };
  const scores = Object.fromEntries(
    RUBRIC_DIMENSIONS.map(dimension => {
      const score = Number(parsed.scores?.[dimension]);
      // A missing score is a failing score: judges cannot pass copy by omission.
      return [dimension, Number.isFinite(score) ? score : 0];
    })
  ) as Record<RubricDimension, number>;
  return {
    model,
    scores,
    confidence: Math.min(1, Math.max(0, Number(parsed.confidence) || 0)),
    pass: RUBRIC_DIMENSIONS.every(dimension => scores[dimension] >= bar),
    critique: (parsed.critique ?? [])
      .filter(line => typeof line === 'string')
      .slice(0, 8),
  };
}

/**
 * Lint, then (by tier) judge. Hybrid blocking:
 *  - any deterministic block finding => revise
 *  - a judge that is confident (>= 0.8) the copy is unsafe or untrue => revise
 *  - otherwise a majority of the panel must pass
 * Judge errors fail closed as "revise", never as "pass".
 */
export async function gateCopy(
  text: string,
  brief: CopyBrief,
  transport?: JudgeTransport
): Promise<CopyGateResult> {
  const lint = lintCopy(text, { register: brief.register });
  const lintCritique = lint.blocking.map(
    finding => `${finding.rule}: "${finding.match}". ${finding.message}`
  );
  if (!lint.ok) {
    return { status: 'revise', lint, verdicts: [], critique: lintCritique };
  }
  const { minJudges } = TIER_POLICY[brief.tier];
  if (minJudges === 0) {
    return { status: 'pass', lint, verdicts: [], critique: [] };
  }
  const judges = transport
    ? selectJudges(brief.tier, brief.generatorModel, transport.available)
    : [];
  // A panel we cannot seat is a failed gate, never a silent pass.
  if (!transport || judges.length < minJudges) {
    return {
      status: 'blocked',
      lint,
      verdicts: [],
      critique: [
        `judge panel unavailable: ${brief.tier} needs ${minJudges} judge(s) from families other than the generator; seated ${judges.length}.`,
      ],
    };
  }

  const { bar } = TIER_POLICY[brief.tier];
  const { system, prompt } = buildJudgePrompt(text, brief);
  const verdicts = await Promise.all(
    judges.map(async model => {
      try {
        return parseVerdict(
          model,
          await transport({ model, system, prompt }),
          bar
        );
      } catch (error) {
        return parseVerdict(
          model,
          JSON.stringify({
            critique: [`judge error: ${String(error).slice(0, 120)}`],
          }),
          bar
        );
      }
    })
  );

  const confidentHarm = verdicts.some(
    verdict =>
      verdict.confidence >= 0.8 &&
      (verdict.scores.truth < 6 || verdict.scores.safety < 6)
  );
  const passes = verdicts.filter(verdict => verdict.pass).length;
  const majority = passes * 2 > verdicts.length;
  const critique = [
    ...new Set(
      verdicts
        .filter(verdict => !verdict.pass)
        .flatMap(verdict => verdict.critique)
    ),
  ];

  return {
    status: !confidentHarm && majority ? 'pass' : 'revise',
    lint,
    verdicts,
    critique,
  };
}

export interface WriteLoopResult {
  readonly status: 'pass' | 'blocked';
  readonly text: string;
  readonly rounds: number;
  readonly history: readonly CopyGateResult[];
}

/**
 * Draft -> gate -> rewrite until the gate passes or rounds run out.
 * Fail-closed: exhausting rounds returns "blocked" and the caller must not ship.
 */
export async function writeUntilPass(
  brief: CopyBrief,
  write: (input: {
    round: number;
    previous?: string;
    critique: readonly string[];
  }) => Promise<string>,
  transport?: JudgeTransport
): Promise<WriteLoopResult> {
  const history: CopyGateResult[] = [];
  let text: string | undefined;
  let critique: readonly string[] = [];
  const { maxRounds } = TIER_POLICY[brief.tier];
  for (let round = 1; round <= maxRounds; round++) {
    text = await write({ round, previous: text, critique });
    const result = await gateCopy(text, brief, transport);
    history.push(result);
    if (result.status === 'pass')
      return { status: 'pass', text, rounds: round, history };
    if (result.status === 'blocked')
      return { status: 'blocked', text, rounds: round, history };
    critique = result.critique;
  }
  return { status: 'blocked', text: text ?? '', rounds: maxRounds, history };
}

/** Families the Vercel AI Gateway allowlist permits (founder rule, 2026-09-17). */
export const GATEWAY_FAMILIES: readonly string[] = ['zai'];

/** AI Gateway transport (OpenAI-compatible endpoint, existing AI_GATEWAY_API_KEY). */
export function gatewayTransport(
  apiKey: string,
  baseUrl = 'https://ai-gateway.vercel.sh/v1'
): JudgeTransport {
  const send: JudgeTransport = async ({ model, system, prompt }) => {
    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${apiKey}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model,
        temperature: 0,
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: prompt },
        ],
      }),
      signal: AbortSignal.timeout(60_000),
    });
    if (!response.ok) throw new Error(`gateway ${response.status}`);
    const body = (await response.json()) as {
      choices?: { message?: { content?: string } }[];
    };
    return body.choices?.[0]?.message?.content ?? '';
  };
  send.available = model => GATEWAY_FAMILIES.includes(family(model));
  return send;
}
