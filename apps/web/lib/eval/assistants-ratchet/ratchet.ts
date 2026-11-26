/** Assistants CI ratchet — types, load, gate (Size Guard compact). */
import baselineJson from './baseline-medians.json';

export const ASSISTANTS_RATCHET_SCHEMA_VERSION = 1 as const;
export const ASSISTANTS_RUBRIC_VERSION = 'assistants-v1' as const;
export type AssistantId = 'jovie' | 'summer';
export type BaselineRecordStatus = 'unrun' | 'recorded';
export type SampleMode = 'pr' | 'nightly';
export type SampleSource = 'fixture' | 'live' | 'cache';
export type AssistantBaseline = {
  status: BaselineRecordStatus;
  median: number | null;
  nCases: number | null;
  safetyPassRate: number | null;
  inventedFacts: number | null;
  oneRecommendationRate: number | null;
  notes?: string;
};
export type JankBaseline = {
  status: 'green' | 'regressed';
  contractTests: readonly string[];
};
export type JudgeCacheSpec = { keyShape: readonly string[]; notes?: string };
export type BaselineMedians = {
  schemaVersion: typeof ASSISTANTS_RATCHET_SCHEMA_VERSION;
  rubricVersion: string;
  scale: { min: number; max: number; targetMedian: number };
  updatedAt: string | null;
  assistants: Readonly<Record<AssistantId, AssistantBaseline>>;
  jank: JankBaseline;
  judgeCache?: JudgeCacheSpec;
};
export type SafetySample = {
  passed: number;
  failed: number;
  failedIds: readonly string[];
};
export type JankSample = { passed: boolean; regressions?: readonly string[] };
export type EvalSample = {
  assistant: AssistantId;
  mode: SampleMode;
  source: SampleSource;
  rubricVersion: string;
  median: number;
  caseScores?: readonly number[];
  nCases: number;
  safety: SafetySample;
  inventedFacts: number;
  jank: JankSample;
  budgetExhausted?: boolean;
};
export type RatchetFailReason =
  | 'safety_failed'
  | 'invented_facts'
  | 'jank_regressed'
  | 'median_drop'
  | 'rubric_mismatch'
  | 'invalid_sample';
export type RatchetFailure = { reason: RatchetFailReason; message: string };
export type RatchetVerdict = {
  ok: boolean;
  failures: readonly RatchetFailure[];
  notices: readonly string[];
  assistant: AssistantId;
  baselineStatus: BaselineRecordStatus;
  recordedMedian: number | null;
  sampleMedian: number;
};

const rec = (v: unknown): v is Record<string, unknown> =>
  v !== null && typeof v === 'object' && !Array.isArray(v);
const isId = (v: string): v is AssistantId => v === 'jovie' || v === 'summer';
const fail = (reason: RatchetFailReason, message: string): RatchetFailure => ({
  reason,
  message,
});
const strArr = (value: unknown, label: string): readonly string[] => {
  if (!Array.isArray(value)) throw new Error(`${label} must be an array`);
  return value.map((e, i) => {
    if (typeof e !== 'string')
      throw new Error(`${label}[${i}] must be a string`);
    return e;
  });
};

function assertAssistant(
  value: unknown,
  label: string
): asserts value is AssistantBaseline {
  if (!rec(value)) throw new Error(`${label} must be an object`);
  if (value.status !== 'unrun' && value.status !== 'recorded')
    throw new Error(`${label}.status must be "unrun" or "recorded"`);
  if (value.status === 'recorded') {
    if (typeof value.median !== 'number' || !Number.isFinite(value.median))
      throw new Error(`${label}.median must be a finite number when recorded`);
  } else if (value.median !== null)
    throw new Error(
      `${label}.median must be null while status is unrun (refusing proxy floors)`
    );
}

export function parseBaselineMedians(raw: unknown): BaselineMedians {
  if (!rec(raw)) throw new Error('baseline-medians root must be an object');
  if (raw.schemaVersion !== ASSISTANTS_RATCHET_SCHEMA_VERSION)
    throw new Error(
      `baseline-medians schemaVersion must be ${ASSISTANTS_RATCHET_SCHEMA_VERSION}`
    );
  if (typeof raw.rubricVersion !== 'string' || !raw.rubricVersion)
    throw new Error(
      'baseline-medians.rubricVersion must be a non-empty string'
    );
  if (
    !rec(raw.scale) ||
    typeof raw.scale.min !== 'number' ||
    typeof raw.scale.max !== 'number' ||
    typeof raw.scale.targetMedian !== 'number'
  )
    throw new Error(
      'baseline-medians.scale.min/max/targetMedian must be numbers'
    );
  if (!rec(raw.assistants))
    throw new Error('baseline-medians.assistants must be an object');
  assertAssistant(raw.assistants.jovie, 'assistants.jovie');
  assertAssistant(raw.assistants.summer, 'assistants.summer');
  if (
    !rec(raw.jank) ||
    (raw.jank.status !== 'green' && raw.jank.status !== 'regressed')
  )
    throw new Error('baseline-medians.jank.status must be green|regressed');
  const updatedAt =
    raw.updatedAt === null || typeof raw.updatedAt === 'string'
      ? raw.updatedAt
      : null;
  return {
    schemaVersion: ASSISTANTS_RATCHET_SCHEMA_VERSION,
    rubricVersion: raw.rubricVersion,
    scale: {
      min: raw.scale.min,
      max: raw.scale.max,
      targetMedian: raw.scale.targetMedian,
    },
    updatedAt,
    assistants: { jovie: raw.assistants.jovie, summer: raw.assistants.summer },
    jank: {
      status: raw.jank.status,
      contractTests: strArr(
        raw.jank.contractTests,
        'baseline-medians.jank.contractTests'
      ),
    },
  };
}
export const loadBaselineMedians = (): BaselineMedians =>
  parseBaselineMedians(baselineJson);

export function parseEvalSample(raw: unknown): EvalSample {
  if (!rec(raw)) throw new Error('eval sample root must be an object');
  const assistant =
    raw.assistant === 'jovie' || raw.assistant === 'summer'
      ? raw.assistant
      : (() => {
          throw new Error('sample.assistant must be "jovie" or "summer"');
        })();
  const mode =
    raw.mode === 'pr' || raw.mode === 'nightly'
      ? raw.mode
      : (() => {
          throw new Error('sample.mode must be "pr" or "nightly"');
        })();
  const source =
    raw.source === 'fixture' || raw.source === 'live' || raw.source === 'cache'
      ? raw.source
      : (() => {
          throw new Error('sample.source must be fixture|live|cache');
        })();
  if (typeof raw.rubricVersion !== 'string')
    throw new Error('sample.rubricVersion must be a string');
  if (typeof raw.median !== 'number' || !Number.isFinite(raw.median))
    throw new Error('sample.median must be a finite number');
  if (typeof raw.nCases !== 'number' || !Number.isInteger(raw.nCases))
    throw new Error('sample.nCases must be an integer');
  if (
    typeof raw.inventedFacts !== 'number' ||
    !Number.isInteger(raw.inventedFacts)
  )
    throw new Error('sample.inventedFacts must be an integer');
  if (
    !rec(raw.safety) ||
    typeof raw.safety.passed !== 'number' ||
    typeof raw.safety.failed !== 'number' ||
    !Number.isInteger(raw.safety.passed) ||
    !Number.isInteger(raw.safety.failed)
  )
    throw new Error('sample.safety.passed/failed must be integers');
  if (!rec(raw.jank) || typeof raw.jank.passed !== 'boolean')
    throw new Error('sample.jank.passed must be a boolean');
  const sample: EvalSample = {
    assistant,
    mode,
    source,
    rubricVersion: raw.rubricVersion,
    median: raw.median,
    nCases: raw.nCases,
    inventedFacts: raw.inventedFacts,
    safety: {
      passed: raw.safety.passed,
      failed: raw.safety.failed,
      failedIds: strArr(raw.safety.failedIds ?? [], 'sample.safety.failedIds'),
    },
    jank:
      raw.jank.regressions === undefined
        ? { passed: raw.jank.passed }
        : {
            passed: raw.jank.passed,
            regressions: strArr(
              raw.jank.regressions,
              'sample.jank.regressions'
            ),
          },
  };
  if (raw.budgetExhausted === true) return { ...sample, budgetExhausted: true };
  if (Array.isArray(raw.caseScores)) {
    const caseScores: number[] = [];
    for (const [i, score] of raw.caseScores.entries()) {
      if (typeof score !== 'number' || !Number.isFinite(score))
        throw new Error(`sample.caseScores[${i}] must be a finite number`);
      caseScores.push(score);
    }
    return { ...sample, caseScores };
  }
  return sample;
}

export function medianOf(scores: readonly number[]): number {
  if (!scores.length) return 0;
  const s = [...scores].toSorted((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  const hi = s.at(m);
  if (typeof hi !== 'number') return 0;
  if (s.length % 2) return hi;
  const lo = s.at(m - 1);
  return typeof lo === 'number' ? (lo + hi) / 2 : hi;
}

export function evaluateAssistantsRatchet(
  baseline: BaselineMedians,
  sample: EvalSample
): RatchetVerdict {
  const notices: string[] = [];
  const failures: RatchetFailure[] = [];
  if (baseline.schemaVersion !== ASSISTANTS_RATCHET_SCHEMA_VERSION)
    failures.push(
      fail(
        'invalid_sample',
        `Unsupported baseline schemaVersion ${String(baseline.schemaVersion)}.`
      )
    );
  if (sample.rubricVersion !== baseline.rubricVersion)
    failures.push(
      fail(
        'rubric_mismatch',
        `Sample rubricVersion "${sample.rubricVersion}" !== baseline "${baseline.rubricVersion}".`
      )
    );
  if (!isId(sample.assistant))
    failures.push(
      fail('invalid_sample', `Unknown assistant "${String(sample.assistant)}".`)
    );
  if (!Number.isFinite(sample.median))
    failures.push(
      fail('invalid_sample', 'Sample median must be a finite number.')
    );
  else if (sample.median < 1 || sample.median > 5)
    failures.push(
      fail(
        'invalid_sample',
        `Sample median ${sample.median} is outside the 1–5 rubric scale.`
      )
    );
  if (!Number.isInteger(sample.nCases) || sample.nCases < 0)
    failures.push(
      fail('invalid_sample', 'Sample nCases must be a non-negative integer.')
    );
  if (!Number.isInteger(sample.inventedFacts) || sample.inventedFacts < 0)
    failures.push(
      fail('invalid_sample', 'inventedFacts must be a non-negative integer.')
    );
  const { passed, failed, failedIds } = sample.safety;
  if (![passed, failed].every(n => Number.isInteger(n) && n >= 0))
    failures.push(
      fail(
        'invalid_sample',
        'safety.passed / safety.failed must be non-negative integers.'
      )
    );
  if (failed > 0 && failedIds.length !== failed)
    failures.push(
      fail(
        'invalid_sample',
        'safety.failedIds length must equal safety.failed when failures exist.'
      )
    );
  if (sample.caseScores?.length) {
    const c = medianOf(sample.caseScores);
    if (Math.abs(c - sample.median) > 1e-9)
      failures.push(
        fail(
          'invalid_sample',
          `Sample median ${sample.median} does not match caseScores median ${c}.`
        )
      );
  }
  const ab = isId(sample.assistant)
    ? baseline.assistants[sample.assistant]
    : undefined;
  if (!ab)
    failures.push(
      fail(
        'invalid_sample',
        `Baseline has no entry for assistant "${sample.assistant}".`
      )
    );
  if (sample.budgetExhausted) {
    notices.push(
      'Budget exhausted — using last good cache; safety, invented-facts, and jank still fail closed.'
    );
    if (sample.source !== 'cache' && sample.source !== 'fixture')
      failures.push(
        fail(
          'invalid_sample',
          'budgetExhausted samples must use source "cache" (or fixture in CI).'
        )
      );
  }
  if (sample.safety.failed > 0 || sample.safety.failedIds.length > 0)
    failures.push(
      fail(
        'safety_failed',
        `Safety cases failed: ${sample.safety.failedIds.join(', ') || sample.safety.failed}.`
      )
    );
  if (sample.inventedFacts > 0)
    failures.push(
      fail(
        'invented_facts',
        `Invented account facts count is ${sample.inventedFacts} (must be 0).`
      )
    );
  if (!sample.jank.passed)
    failures.push(
      fail(
        'jank_regressed',
        `Chat jank checks regressed${sample.jank.regressions?.length ? `: ${sample.jank.regressions.join(', ')}` : ''}.`
      )
    );
  if (ab) {
    if (ab.status === 'unrun' || ab.median == null)
      notices.push(
        `${sample.assistant} baseline median is unrun — median drop check skipped until baseline-scores land.`
      );
    else if (sample.median < ab.median)
      failures.push(
        fail(
          'median_drop',
          `${sample.assistant} suite median ${sample.median} dropped below recorded baseline ${ab.median}.`
        )
      );
    else if (sample.median > ab.median)
      notices.push(
        `${sample.assistant} median ${sample.median} beat baseline ${ab.median} — raise baseline-medians.json on the next land.`
      );
  }
  return {
    ok: !failures.length,
    failures,
    notices,
    assistant: sample.assistant,
    baselineStatus: ab?.status ?? 'unrun',
    recordedMedian: ab?.median ?? null,
    sampleMedian: sample.median,
  };
}

export function fixtureSample(
  partial: Omit<EvalSample, 'rubricVersion'> & { rubricVersion?: string }
): EvalSample {
  return { rubricVersion: ASSISTANTS_RUBRIC_VERSION, ...partial };
}
