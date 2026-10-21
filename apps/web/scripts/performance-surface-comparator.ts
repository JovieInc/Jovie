import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  type InteractionLatencySample,
  percentile,
} from './performance-interaction-report';

// These ceilings belong to JOV-3887. Trusted policy may only tighten them.
const metrics = {
  p50FirstFeedbackMs: ['firstFeedbackMs', 50, 100],
  p95FirstFeedbackMs: ['firstFeedbackMs', 95, 100],
  p95UsableStateMs: ['usableStateMs', 95, 300],
  p95RenderToInteractiveMs: ['renderToInteractiveMs', 95, 50],
  maxDroppedFrameCount: ['droppedFrameCount', 100, 0],
} as const;
export type SurfaceMetric = keyof typeof metrics;
type Values = Record<SurfaceMetric, number>;

export interface SurfaceProfile {
  readonly scenarioId: string;
  readonly platform: 'desktop' | 'phone' | 'native';
  readonly browser: string; // Include version; native collectors use their runtime.
  readonly measurementVersion: string;
  readonly fixtureVersion: string;
  readonly workload: {
    readonly authPersona: string;
    readonly buildMode: string;
    readonly cacheState: string;
    readonly cpuProfile: string;
    readonly datasetSize: string;
    readonly networkProfile: string;
    readonly viewport: string;
    readonly workers: number;
  };
}

export interface SurfaceAttempt {
  readonly id: string;
  readonly head: string;
  readonly profile: SurfaceProfile;
  readonly startedAt: string;
  readonly completedAt: string;
  readonly attempt: number; // One based; Playwright retry + 1.
  readonly status: 'pass' | 'fail' | 'incomplete';
  readonly samples: readonly InteractionLatencySample[];
}

export interface SurfacePolicy {
  readonly declaredAt: string;
  readonly maxAgeMs: number;
  readonly sampleCount: number;
  readonly surfaces: readonly {
    readonly profile: SurfaceProfile;
    readonly ceilings: Values;
    readonly noiseAllowance: Values;
  }[];
}

export interface SurfaceBaselineBundle {
  readonly schema: 'jovie-surface-baseline/v1';
  readonly policy: SurfacePolicy;
  readonly controls: readonly SurfaceAttempt[];
  readonly history: readonly {
    readonly parentDigest: string | null;
    readonly runs: readonly SurfaceAttempt[];
  }[];
}

/** All fields come from the trusted controller, never candidate files/flags. */
export interface SurfaceBaselineTrust {
  readonly repository: 'JovieInc/Jovie';
  readonly ref: string;
  readonly commit: string;
  readonly path: string;
  readonly digest: string;
}

export interface TrustedSurfaceBaseline {
  readonly provenance: SurfaceBaselineTrust;
}

interface BaselineState {
  readonly bundle: SurfaceBaselineBundle;
  readonly best: ReadonlyMap<string, Values>;
  readonly noise: ReadonlyMap<string, Values>;
  readonly latest: number;
}

const trusted = new WeakMap<TrustedSurfaceBaseline, BaselineState>();
const sha = /^[a-f0-9]{40}$/;
const digestPattern = /^[a-f0-9]{64}$/;
const nonempty = (value: unknown): value is string =>
  typeof value === 'string' && value.trim().length > 0;
const finite = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value) && value >= 0;

function requireEvidence(
  condition: unknown,
  reason: string
): asserts condition {
  if (!condition) throw new Error(reason);
}

function time(value: string) {
  const parsed = typeof value === 'string' ? Date.parse(value) : NaN;
  requireEvidence(Number.isFinite(parsed), 'missing or invalid timestamp');
  return parsed;
}

/** Canonical serialization for profile keys and append-only history links. */
function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.entries(value)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, item]) => `${JSON.stringify(key)}:${canonical(item)}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
}

export function surfaceEvidenceDigest(value: unknown) {
  return createHash('sha256').update(canonical(value)).digest('hex');
}

function profileKey(profile: SurfaceProfile) {
  requireEvidence(
    profile &&
      ['desktop', 'phone', 'native'].includes(profile.platform) &&
      [
        profile.scenarioId,
        profile.browser,
        profile.measurementVersion,
        profile.fixtureVersion,
        profile.workload?.authPersona,
        profile.workload?.buildMode,
        profile.workload?.cacheState,
        profile.workload?.cpuProfile,
        profile.workload?.datasetSize,
        profile.workload?.networkProfile,
        profile.workload?.viewport,
      ].every(nonempty) &&
      Number.isInteger(profile.workload?.workers) &&
      profile.workload.workers > 0,
    'incomplete measurement profile'
  );
  return canonical(profile);
}

function mapMetrics(compute: (metric: SurfaceMetric) => number): Values {
  return Object.fromEntries(
    (Object.keys(metrics) as SurfaceMetric[]).map(key => [key, compute(key)])
  ) as Values;
}

function checkRun(run: SurfaceAttempt, now: number, sampleCount: number) {
  requireEvidence(
    nonempty(run.id) &&
      sha.test(run.head) &&
      Number.isInteger(run.attempt) &&
      run.attempt >= 1,
    'invalid run identity or attempt'
  );
  const started = time(run.startedAt);
  const completed = time(run.completedAt);
  requireEvidence(
    started <= completed && completed <= now,
    'invalid run window'
  );
  requireEvidence(
    run.attempt === 1 && run.status === 'pass',
    'failed or missing first attempt'
  );
  requireEvidence(
    Array.isArray(run.samples) && run.samples.length === sampleCount,
    'incomplete or incompatible sample count'
  );
  const indices = new Set<number>();
  for (const sample of run.samples) {
    requireEvidence(
      sample.scenarioId === run.profile.scenarioId &&
        Number.isInteger(sample.runIndex) &&
        sample.runIndex >= 0 &&
        !indices.has(sample.runIndex),
      'duplicate or incompatible sample'
    );
    indices.add(sample.runIndex);
  }
  requireEvidence(
    [...indices].every(index => index < run.samples.length),
    'incomplete sample sequence'
  );
  return mapMetrics(metric => {
    const [field, rank] = metrics[metric];
    const values = run.samples.map(sample => sample[field]);
    requireEvidence(
      values.every(finite),
      `missing or invalid metric: ${metric}`
    );
    if (metric === 'maxDroppedFrameCount') {
      requireEvidence(values.every(Number.isInteger), 'invalid frame count');
    }
    return percentile(values, rank) as number;
  });
}

function withinCeilings(values: Values, ceilings: Values) {
  for (const metric of Object.keys(metrics) as SurfaceMetric[]) {
    // Latency ceilings are strict (<); zero dropped frames is inclusive.
    requireEvidence(
      ceilings[metric] === 0
        ? values[metric] === 0
        : values[metric] < ceilings[metric],
      `absolute ceiling exceeded: ${metric}`
    );
  }
}

function firstAttempts(runs: readonly SurfaceAttempt[], policy: SurfacePolicy) {
  requireEvidence(
    Array.isArray(runs) && runs.length > 0,
    'missing surface evidence'
  );
  const expected = new Set(
    policy.surfaces.map(surface => profileKey(surface.profile))
  );
  const first = new Map<string, SurfaceAttempt>();
  const identities = new Set<string>();
  for (const run of runs) {
    const key = profileKey(run.profile);
    requireEvidence(expected.has(key), 'incompatible measurement profile');
    requireEvidence(
      nonempty(run.id) && !identities.has(run.id),
      'duplicate run identity'
    );
    identities.add(run.id);
    requireEvidence(
      Number.isInteger(run.attempt) && run.attempt >= 1,
      'invalid attempt'
    );
    if (run.attempt !== 1) continue; // Retries are never scored or promoted.
    requireEvidence(!first.has(key), 'duplicate first attempt');
    first.set(key, run);
  }
  requireEvidence(
    first.size === expected.size,
    'missing required surfaces or first attempt'
  );
  return first;
}

function evaluateRuns(
  runs: readonly SurfaceAttempt[],
  state: BaselineState,
  now: number,
  expectedHead: string,
  freshness: boolean
) {
  requireEvidence(sha.test(expectedHead), 'missing expected candidate head');
  const { policy } = state.bundle;
  const first = firstAttempts(runs, policy);
  // A retry with another head cannot conceal a different candidate execution.
  requireEvidence(
    runs.every(run => run.head === expectedHead),
    'candidate head mismatch'
  );
  const measured = new Map<string, Values>();
  for (const surface of policy.surfaces) {
    const key = profileKey(surface.profile);
    const run = first.get(key) as SurfaceAttempt;
    const values = checkRun(run, now, policy.sampleCount);
    requireEvidence(
      time(run.startedAt) >= state.latest,
      'candidate predates baseline or controls'
    );
    if (freshness)
      requireEvidence(
        now - time(run.completedAt) <= policy.maxAgeMs,
        'stale candidate evidence'
      );
    withinCeilings(values, surface.ceilings);
    const baseline = state.best.get(key);
    if (baseline) {
      const noise = state.noise.get(key) as Values;
      for (const metric of Object.keys(metrics) as SurfaceMetric[]) {
        requireEvidence(
          values[metric] <= baseline[metric] + noise[metric],
          `regression: ${surface.profile.scenarioId}/${surface.profile.platform}/${metric}`
        );
      }
    }
    measured.set(key, values);
  }
  return measured;
}

function qualifyControls(bundle: SurfaceBaselineBundle, cutoff: number) {
  const { policy } = bundle;
  const noise = new Map<string, Values>();
  let controlsEnd = time(policy.declaredAt);
  for (const surface of policy.surfaces) {
    const key = profileKey(surface.profile);
    const controls = bundle.controls.filter(
      run =>
        profileKey(run.profile) === key &&
        time(run.completedAt) <= cutoff &&
        cutoff - time(run.completedAt) <= policy.maxAgeMs
    );
    requireEvidence(
      controls.length >= 3,
      'at least three fresh identical-head controls required'
    );
    const heads = new Set(controls.map(run => run.head));
    const counts = new Set(controls.map(run => run.samples.length));
    requireEvidence(
      heads.size === 1 && counts.size === 1,
      'controls must use identical head and sample count'
    );
    const values = controls.map(run => {
      const measured = checkRun(run, cutoff, policy.sampleCount);
      controlsEnd = Math.max(controlsEnd, time(run.completedAt));
      withinCeilings(measured, surface.ceilings);
      return measured;
    });
    noise.set(
      key,
      mapMetrics(metric => {
        const spread =
          Math.max(...values.map(value => value[metric])) -
          Math.min(...values.map(value => value[metric]));
        requireEvidence(
          spread <= surface.noiseAllowance[metric],
          `unqualified control noise: ${metric}`
        );
        // A large declaration never grants more slack than controls demonstrated.
        return Math.min(spread, surface.noiseAllowance[metric]);
      })
    );
  }
  return { noise, controlsEnd };
}

function validateBundle(
  bundle: SurfaceBaselineBundle,
  now: number
): BaselineState {
  requireEvidence(
    bundle?.schema === 'jovie-surface-baseline/v1',
    'invalid baseline schema'
  );
  const { policy } = bundle;
  requireEvidence(
    policy &&
      finite(policy.maxAgeMs) &&
      policy.maxAgeMs > 0 &&
      Number.isInteger(policy.sampleCount) &&
      policy.sampleCount >= 5 &&
      Array.isArray(policy.surfaces) &&
      policy.surfaces.length > 0,
    'invalid baseline policy'
  );
  const declared = time(policy.declaredAt);
  const keys = new Set<string>();
  for (const surface of policy.surfaces) {
    const key = profileKey(surface.profile);
    requireEvidence(!keys.has(key), 'duplicate policy surface');
    keys.add(key);
    for (const metric of Object.keys(metrics) as SurfaceMetric[]) {
      requireEvidence(
        finite(surface.ceilings?.[metric]) &&
          surface.ceilings[metric] <= metrics[metric][2] &&
          finite(surface.noiseAllowance?.[metric]),
        'missing metric policy or relaxed epic ceiling'
      );
    }
  }
  requireEvidence(
    Array.isArray(bundle.controls),
    'missing identical-head controls'
  );
  requireEvidence(
    Array.isArray(bundle.history) && bundle.history.length > 0,
    'missing baseline history'
  );
  const controlIds = new Set<string>();
  for (const run of bundle.controls) {
    requireEvidence(
      keys.has(profileKey(run.profile)),
      'incompatible control profile'
    );
    requireEvidence(!controlIds.has(run.id), 'duplicate control run');
    controlIds.add(run.id);
    checkRun(run, now, policy.sampleCount);
    requireEvidence(
      time(run.startedAt) >= declared,
      'noise policy must precede controls'
    );
  }
  const best = new Map<string, Values>();
  let state: BaselineState = {
    bundle,
    best,
    noise: new Map(),
    latest: declared,
  };
  let previous: SurfaceBaselineBundle['history'][number] | undefined;
  const historyIds = new Set(controlIds);
  for (const entry of bundle.history) {
    requireEvidence(
      entry.parentDigest ===
        (previous ? surfaceEvidenceDigest(previous) : null),
      'rewritten baseline history'
    );
    const head = entry.runs[0]?.head;
    requireEvidence(head, 'missing baseline runs');
    // Later controls cannot retroactively qualify an earlier history entry.
    const cutoff = Math.min(
      ...entry.runs
        .filter((run: SurfaceAttempt) => run.attempt === 1)
        .map((run: SurfaceAttempt) => time(run.startedAt))
    );
    const qualified = qualifyControls(bundle, cutoff);
    state = {
      ...state,
      noise: qualified.noise,
      latest: Math.max(state.latest, qualified.controlsEnd),
    };
    const measured = evaluateRuns(entry.runs, state, now, head, false);
    for (const run of entry.runs) {
      requireEvidence(
        !historyIds.has(run.id),
        'reused historical run identity'
      );
      historyIds.add(run.id);
    }
    for (const [key, values] of measured) {
      const prior = best.get(key);
      best.set(
        key,
        mapMetrics(metric =>
          Math.min(prior?.[metric] ?? Infinity, values[metric])
        )
      );
    }
    state = {
      ...state,
      latest: Math.max(
        ...[...firstAttempts(entry.runs, policy).values()].map(run =>
          time(run.completedAt)
        )
      ),
    };
    previous = entry;
  }
  requireEvidence(
    now - state.latest <= policy.maxAgeMs,
    'stale baseline evidence'
  );
  const qualified = qualifyControls(bundle, now);
  return {
    ...state,
    noise: qualified.noise,
    latest: Math.max(state.latest, qualified.controlsEnd),
  };
}

/** Read only pinned Git objects. Dirty checkout files never supply policy/history.
 * The controller must fetch the authenticated remote and own all trust inputs.
 */
export function loadTrustedSurfaceBaseline(
  repoRoot: string,
  trust: SurfaceBaselineTrust,
  now = Date.now()
): TrustedSurfaceBaseline {
  requireEvidence(
    trust.repository === 'JovieInc/Jovie' &&
      sha.test(trust.commit) &&
      digestPattern.test(trust.digest) &&
      /^refs\/remotes\/origin\/(?:main|release\/[a-zA-Z0-9._/-]+)$/.test(
        trust.ref
      ) &&
      nonempty(trust.path) &&
      !trust.path.startsWith('-') &&
      !trust.path.split('/').includes('..') &&
      !trust.path.includes(':'),
    'invalid trusted main/release binding'
  );
  const git = (...args: string[]) => {
    const output = execFileSync('git', args, {
      cwd: repoRoot,
      encoding: 'utf8',
      maxBuffer: 16 * 1024 * 1024,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    return args[0] === 'show' ? output : output.trim();
  };
  requireEvidence(
    [
      'https://github.com/JovieInc/Jovie.git',
      'git@github.com:JovieInc/Jovie.git',
    ].includes(git('remote', 'get-url', 'origin')),
    'repository provenance mismatch'
  );
  requireEvidence(
    git('rev-parse', '--verify', `${trust.ref}^{commit}`) === trust.commit,
    'stale or tampered trusted ref'
  );
  const raw = git('show', `${trust.commit}:${trust.path}`);
  requireEvidence(
    createHash('sha256').update(raw).digest('hex') === trust.digest,
    'baseline provenance digest mismatch'
  );
  const bundle = JSON.parse(raw) as SurfaceBaselineBundle;
  const state = validateBundle(bundle, now);
  const heads = new Set(
    [...bundle.controls, ...bundle.history.flatMap(entry => entry.runs)].map(
      run => run.head
    )
  );
  for (const head of heads)
    git('merge-base', '--is-ancestor', head, trust.commit);
  const handle = Object.freeze({ provenance: Object.freeze({ ...trust }) });
  trusted.set(handle, state);
  return handle;
}

export function compareSurfaceMeasurements(
  baseline: TrustedSurfaceBaseline,
  runs: readonly SurfaceAttempt[],
  expectedHead: string,
  now = Date.now()
) {
  try {
    const stored = trusted.get(baseline);
    requireEvidence(stored, 'baseline was not loaded from trusted evidence');
    // Revalidate freshness even when a caller retains a handle for a long time.
    const state = validateBundle(stored.bundle, now);
    const priorIds = new Set(
      [
        ...stored.bundle.controls,
        ...stored.bundle.history.flatMap(entry => entry.runs),
      ].map(run => run.id)
    );
    requireEvidence(
      Array.isArray(runs) && runs.every(run => !priorIds.has(run.id)),
      'reused historical run identity'
    );
    evaluateRuns(runs, state, now, expectedHead, true);
    return {
      status: 'pass' as const,
      reasons: [] as string[],
      diagnosticRetries: runs.filter(run => run.attempt > 1).length,
    };
  } catch (error) {
    return {
      status: 'fail' as const,
      reasons: [error instanceof Error ? error.message : 'invalid evidence'],
      diagnosticRetries: Array.isArray(runs)
        ? runs.filter(run => run?.attempt > 1).length
        : 0,
    };
  }
}

/** Produce an append proposal; only the main/release controller may persist it.
 * Worsening metrics within qualified noise never raise the historical minima.
 */
export function promoteSurfaceBaseline(
  baseline: TrustedSurfaceBaseline,
  runs: readonly SurfaceAttempt[],
  now = Date.now()
): SurfaceBaselineBundle {
  const result = compareSurfaceMeasurements(
    baseline,
    runs,
    baseline.provenance.commit,
    now
  );
  requireEvidence(result.status === 'pass', result.reasons.join('; '));
  const { bundle } = trusted.get(baseline) as BaselineState;
  const first = runs.filter(run => run.attempt === 1);
  const entry = {
    parentDigest: surfaceEvidenceDigest(
      bundle.history[bundle.history.length - 1]
    ),
    runs: first,
  };
  const proposal = structuredClone({
    ...bundle,
    history: [...bundle.history, entry],
  });
  validateBundle(proposal, now);
  return proposal;
}
