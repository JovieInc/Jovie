// @vitest-environment node
import { execFileSync, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import { buildInteractionLatencyReport } from './performance-interaction-report';
import {
  compareSurfaceMeasurements,
  loadTrustedSurfaceBaseline,
  promoteSurfaceBaseline,
  type SurfaceAttempt,
  type SurfaceBaselineBundle,
  type SurfaceBaselineTrust,
  type SurfaceProfile,
  surfaceEvidenceDigest,
} from './performance-surface-comparator';
import { runSurfaceComparison } from './performance-surface-compare';

const epoch = Date.parse('2026-10-21T00:00:00Z');
const at = (minute: number) => new Date(epoch + minute * 60_000).toISOString();
const now = epoch + 50 * 60_000;
const candidateHead = 'c'.repeat(40);
const directories: string[] = [];
afterEach(() => {
  for (const path of directories.splice(0))
    rmSync(path, { recursive: true, force: true });
});

const profile = (platform: SurfaceProfile['platform']): SurfaceProfile => ({
  scenarioId: 'chat-message-round-trip',
  platform,
  browser: platform === 'native' ? 'webkit-26' : 'chromium-142',
  measurementVersion: 'chat-probe/v1',
  fixtureVersion: 'mock-stream/v1',
  workload: {
    authPersona: 'creator-ready',
    buildMode: 'production',
    cacheState: 'warm',
    cpuProfile: 'unthrottled',
    datasetSize: '5-messages',
    networkProfile: 'mock-stream',
    viewport: platform === 'phone' ? '390x844' : '1440x900',
    workers: 8,
  },
});
const profiles = ['desktop', 'phone', 'native'].map(platform =>
  profile(platform as SurfaceProfile['platform'])
);
const values = (feedback = 40, usable = 140) => ({
  p50FirstFeedbackMs: feedback,
  p95FirstFeedbackMs: feedback,
  p95UsableStateMs: usable,
  p95RenderToInteractiveMs: 20,
  maxDroppedFrameCount: 0,
});

function run(
  p: SurfaceProfile,
  id: string,
  head: string,
  minute: number,
  feedback = 40,
  usable = 140
): SurfaceAttempt {
  return {
    id,
    head,
    profile: p,
    startedAt: at(minute),
    completedAt: at(minute + 0.1),
    attempt: 1,
    status: 'pass',
    samples: Array.from({ length: 5 }, (_, runIndex) => ({
      scenarioId: p.scenarioId,
      runIndex,
      firstFeedbackMs: feedback,
      usableStateMs: usable,
      renderToInteractiveMs: 20,
      droppedFrameCount: 0,
    })),
  };
}
const candidate = (
  head = candidateHead,
  feedback = 40,
  usable = 140,
  prefix = 'candidate',
  minute = 30
) =>
  profiles.map(p =>
    run(p, `${prefix}-${p.platform}`, head, minute, feedback, usable)
  );

function fixture(
  change?: (bundle: SurfaceBaselineBundle) => SurfaceBaselineBundle
) {
  const root = mkdtempSync(join(tmpdir(), 'jovie-surface-'));
  directories.push(root);
  const git = (...args: string[]) =>
    execFileSync('git', args, {
      cwd: root,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    }).trim();
  git('init', '--quiet');
  git('config', 'user.name', 'Comparator fixture');
  git('config', 'user.email', 'fixture@example.invalid');
  git('config', 'commit.gpgsign', 'false');
  git('remote', 'add', 'origin', 'https://github.com/JovieInc/Jovie.git');
  writeFileSync(join(root, 'seed'), 'fixture');
  git('add', 'seed');
  git('commit', '--quiet', '-m', 'fixture root');
  const head = git('rev-parse', 'HEAD');
  let bundle: SurfaceBaselineBundle = {
    schema: 'jovie-surface-baseline/v1',
    policy: {
      declaredAt: at(0),
      maxAgeMs: 60 * 60_000,
      sampleCount: 5,
      surfaces: profiles.map(p => ({
        profile: p,
        ceilings: {
          p50FirstFeedbackMs: 100,
          p95FirstFeedbackMs: 100,
          p95UsableStateMs: 300,
          p95RenderToInteractiveMs: 50,
          maxDroppedFrameCount: 0,
        },
        noiseAllowance: { ...values(0, 0), p95RenderToInteractiveMs: 0 },
      })),
    },
    controls: profiles.flatMap(p =>
      [1, 2, 3].map(index =>
        run(p, `control-${p.platform}-${index}`, head, index, 40, 140)
      )
    ),
    history: [
      {
        parentDigest: null,
        runs: profiles.map(p => run(p, `baseline-${p.platform}`, head, 10)),
      },
    ],
  };
  if (change) bundle = change(bundle);
  function store(next: SurfaceBaselineBundle) {
    const raw = JSON.stringify(next, null, 2) + '\n';
    writeFileSync(join(root, 'baseline.json'), raw);
    git('add', 'baseline.json');
    git('commit', '--quiet', '-m', 'fixture evidence');
    const commit = git('rev-parse', 'HEAD');
    git('update-ref', 'refs/remotes/origin/main', commit);
    const trust: SurfaceBaselineTrust = {
      repository: 'JovieInc/Jovie',
      ref: 'refs/remotes/origin/main',
      commit,
      path: 'baseline.json',
      digest: createHash('sha256').update(raw).digest('hex'),
    };
    return trust;
  }
  const trust = store(bundle);
  return {
    root,
    git,
    head,
    bundle,
    store,
    trust,
    load: () => loadTrustedSurfaceBaseline(root, trust, now),
  };
}

describe('trusted surface regression comparator', () => {
  it('fails a regression below every absolute ceiling using existing report samples', () => {
    const f = fixture();
    const runs = candidate(candidateHead, 45, 150);
    expect(
      buildInteractionLatencyReport({ samples: runs[0]!.samples }).status
    ).toBe('pass');
    expect(
      compareSurfaceMeasurements(f.load(), runs, candidateHead, now)
    ).toMatchObject({
      status: 'fail',
      reasons: [expect.stringContaining('regression:')],
    });
  });

  it('accepts legitimate improvement independently on desktop, phone, and native', () => {
    const f = fixture();
    expect(
      compareSurfaceMeasurements(
        f.load(),
        candidate(candidateHead, 35, 120),
        candidateHead,
        now
      ).status
    ).toBe('pass');
  });

  it.each([
    'platform',
    'browser',
    'measurementVersion',
    'fixtureVersion',
  ] as const)(
    'rejects an incompatible %s rather than pooling profiles',
    field => {
      const f = fixture();
      const runs = candidate();
      runs[0] = {
        ...runs[0]!,
        profile: { ...runs[0]!.profile, [field]: 'changed' },
      };
      expect(
        compareSurfaceMeasurements(f.load(), runs, candidateHead, now).status
      ).toBe('fail');
    }
  );

  it.each([
    'authPersona',
    'buildMode',
    'cacheState',
    'cpuProfile',
    'datasetSize',
    'networkProfile',
    'viewport',
    'workers',
  ] as const)('rejects changed workload %s', field => {
    const f = fixture();
    const runs = candidate();
    runs[0] = {
      ...runs[0]!,
      profile: {
        ...runs[0]!.profile,
        workload: {
          ...runs[0]!.profile.workload,
          [field]: field === 'workers' ? 1 : 'changed',
        },
      },
    };
    expect(
      compareSurfaceMeasurements(f.load(), runs, candidateHead, now).status
    ).toBe('fail');
  });

  it('does not let a missing slower phone surface disappear', () => {
    const f = fixture();
    expect(
      compareSurfaceMeasurements(
        f.load(),
        candidate().slice(0, 1),
        candidateHead,
        now
      )
    ).toMatchObject({
      status: 'fail',
      reasons: [expect.stringContaining('missing required surfaces')],
    });
    expect(
      compareSurfaceMeasurements(f.load(), [], candidateHead, now).status
    ).toBe('fail');
  });

  it('keeps a failed first attempt failed when its retry passes', () => {
    const f = fixture();
    const runs = candidate();
    const first = { ...runs[0]!, status: 'fail' as const };
    const retry = { ...runs[0]!, id: 'retry', attempt: 2 };
    expect(
      compareSurfaceMeasurements(
        f.load(),
        [first, ...runs.slice(1), retry],
        candidateHead,
        now
      )
    ).toMatchObject({
      status: 'fail',
      diagnosticRetries: 1,
      reasons: ['failed or missing first attempt'],
    });
    expect(
      compareSurfaceMeasurements(
        f.load(),
        [...runs.slice(1), retry],
        candidateHead,
        now
      ).status
    ).toBe('fail');
  });

  it('never scores diagnostic retries even if their metrics fail', () => {
    const f = fixture();
    const runs = candidate();
    const retry = {
      ...runs[0]!,
      id: 'retry',
      attempt: 2,
      status: 'fail' as const,
      samples: [],
    };
    expect(
      compareSurfaceMeasurements(f.load(), [...runs, retry], candidateHead, now)
    ).toMatchObject({ status: 'pass', diagnosticRetries: 1 });
  });

  it('rejects incomplete, nonfinite, duplicate, or truncated samples', () => {
    const f = fixture();
    const baseline = f.load();
    const samples = candidate()[0]!.samples;
    for (const invalid of [
      samples.slice(1),
      [...samples, samples[0]!],
      samples.map(sample => ({ ...sample, usableStateMs: NaN })),
      samples.map(sample => ({ ...sample, renderToInteractiveMs: undefined })),
      samples.map(sample => ({ ...sample, runIndex: 0 })),
      samples.map(sample => ({ ...sample, runIndex: sample.runIndex + 1 })),
      samples.map(sample => ({ ...sample, scenarioId: 'other' })),
      samples.map(sample => ({ ...sample, droppedFrameCount: 0.5 })),
    ]) {
      expect(
        compareSurfaceMeasurements(
          baseline,
          [{ ...candidate()[0]!, samples: invalid }, ...candidate().slice(1)],
          candidateHead,
          now
        ).status
      ).toBe('fail');
    }
  });

  it('fails stale candidate, baseline, controls, future evidence, and wrong heads', () => {
    const f = fixture();
    const baseline = f.load();
    expect(
      compareSurfaceMeasurements(
        baseline,
        candidate(),
        candidateHead,
        epoch + 120 * 60_000
      ).status
    ).toBe('fail');
    const runs = candidate();
    for (const override of [
      { completedAt: at(90) },
      { startedAt: at(40), completedAt: at(30) },
      { startedAt: at(0) },
      { head: 'd'.repeat(40) },
      { attempt: 0 },
    ]) {
      expect(
        compareSurfaceMeasurements(
          baseline,
          [{ ...runs[0]!, ...override }, ...runs.slice(1)],
          candidateHead,
          now
        ).status
      ).toBe('fail');
    }
    expect(compareSurfaceMeasurements(baseline, runs, '', now).status).toBe(
      'fail'
    );
  });

  it('rejects candidate-created baseline handles', () => {
    const f = fixture();
    expect(
      compareSurfaceMeasurements(
        { provenance: f.trust },
        candidate(),
        candidateHead,
        now
      ).status
    ).toBe('fail');
  });

  it('ignores checkout policy edits and candidate-supplied ceilings or history', () => {
    const f = fixture();
    writeFileSync(
      join(f.root, 'baseline.json'),
      '{"policy":"replaced by candidate"}'
    );
    expect(
      compareSurfaceMeasurements(f.load(), candidate(), candidateHead, now)
        .status
    ).toBe('pass');
    const trustFile = join(f.root, 'host-trust.json');
    const candidateFile = join(f.root, 'candidate.json');
    writeFileSync(trustFile, JSON.stringify(f.trust));
    writeFileSync(
      candidateFile,
      JSON.stringify({
        runs: candidate(candidateHead, 60),
        policy: { surfaces: [], ceilings: 99999 },
        history: [],
      })
    );
    expect(
      runSurfaceComparison(f.root, trustFile, candidateFile, candidateHead, now)
        .status
    ).toBe('fail');
  });

  it('rejects tampered digests, source refs, repository identity, and unreachable heads', () => {
    const f = fixture();
    for (const override of [
      { digest: '0'.repeat(64) },
      { commit: f.head },
      { ref: 'HEAD' },
      { ref: 'refs/remotes/origin/candidate' },
      { repository: 'other/repo' },
      { path: '../baseline.json' },
    ]) {
      expect(() =>
        loadTrustedSurfaceBaseline(
          f.root,
          { ...f.trust, ...override } as SurfaceBaselineTrust,
          now
        )
      ).toThrow();
    }
    f.git('remote', 'set-url', 'origin', 'https://example.invalid/Jovie.git');
    expect(f.load).toThrow('repository provenance mismatch');
    const untrustedHead = fixture(bundle => ({
      ...bundle,
      history: [{ parentDigest: null, runs: candidate() }],
    }));
    expect(untrustedHead.load).toThrow();
  });

  it('loads release evidence only at the pinned release commit', () => {
    const f = fixture();
    const ref = 'refs/remotes/origin/release/2026-10';
    f.git('update-ref', ref, f.trust.commit);
    expect(
      loadTrustedSurfaceBaseline(f.root, { ...f.trust, ref }, now).provenance
        .commit
    ).toBe(f.trust.commit);
  });

  it('qualifies declared noise with repeated identical-head controls', () => {
    const f = fixture(bundle => ({
      ...bundle,
      policy: {
        ...bundle.policy,
        surfaces: bundle.policy.surfaces.map(surface => ({
          ...surface,
          noiseAllowance: {
            ...surface.noiseAllowance,
            p50FirstFeedbackMs: 50,
            p95FirstFeedbackMs: 50,
          },
        })),
      },
      controls: bundle.controls.map((control, index) => ({
        ...control,
        samples: control.samples.map(sample => ({
          ...sample,
          firstFeedbackMs: index % 3 === 2 ? 42 : 40,
        })),
      })),
    }));
    const baseline = f.load();
    expect(
      compareSurfaceMeasurements(
        baseline,
        candidate(candidateHead, 42),
        candidateHead,
        now
      ).status
    ).toBe('pass');
    // Declared 50ms cannot hide 3ms: controls demonstrated only 2ms.
    expect(
      compareSurfaceMeasurements(
        baseline,
        candidate(candidateHead, 43),
        candidateHead,
        now
      ).status
    ).toBe('fail');
    expect(
      compareSurfaceMeasurements(
        baseline,
        candidate(candidateHead, 100),
        candidateHead,
        now
      ).status
    ).toBe('fail');
  });

  it('never relaxes absolute ceilings with noise', () => {
    const f = fixture(bundle => ({
      ...bundle,
      policy: {
        ...bundle.policy,
        surfaces: bundle.policy.surfaces.map(surface => ({
          ...surface,
          noiseAllowance: { ...surface.noiseAllowance, p95UsableStateMs: 30 },
        })),
      },
      controls: bundle.controls.map((control, index) => ({
        ...control,
        samples: control.samples.map(sample => ({
          ...sample,
          usableStateMs: index % 3 === 2 ? 290 : 270,
        })),
      })),
      history: bundle.history.map(entry => ({
        ...entry,
        runs: entry.runs.map(control => ({
          ...control,
          samples: control.samples.map(sample => ({
            ...sample,
            usableStateMs: 290,
          })),
        })),
      })),
    }));
    expect(
      compareSurfaceMeasurements(
        f.load(),
        candidate(candidateHead, 40, 300),
        candidateHead,
        now
      )
    ).toMatchObject({
      status: 'fail',
      reasons: ['absolute ceiling exceeded: p95UsableStateMs'],
    });
  });

  it('rejects undeclared, unqualified, insufficient, or nonidentical controls', () => {
    const cases = [
      (bundle: SurfaceBaselineBundle) => ({
        ...bundle,
        controls: bundle.controls.slice(1),
      }),
      (bundle: SurfaceBaselineBundle) => ({
        ...bundle,
        controls: bundle.controls.map((control, index) =>
          index === 0 ? { ...control, head: candidateHead } : control
        ),
      }),
      (bundle: SurfaceBaselineBundle) => ({
        ...bundle,
        policy: { ...bundle.policy, declaredAt: at(5) },
      }),
      (bundle: SurfaceBaselineBundle) => ({
        ...bundle,
        controls: bundle.controls.map((control, index) =>
          index === 0
            ? { ...control, samples: control.samples.slice(1) }
            : control
        ),
      }),
      (bundle: SurfaceBaselineBundle) => ({
        ...bundle,
        controls: bundle.controls.map((control, index) =>
          index === 0
            ? {
                ...control,
                samples: control.samples.map(sample => ({
                  ...sample,
                  firstFeedbackMs: 41,
                })),
              }
            : control
        ),
      }),
      (bundle: SurfaceBaselineBundle) => ({
        ...bundle,
        policy: {
          ...bundle.policy,
          surfaces: bundle.policy.surfaces.map(surface => ({
            ...surface,
            ceilings: { ...surface.ceilings, p95UsableStateMs: 301 },
          })),
        },
      }),
    ];
    for (const change of cases) expect(fixture(change).load).toThrow();
  });

  it('promotes trusted improvements by appending and keeps prior measurements immutable', () => {
    const f = fixture();
    const before = JSON.stringify(f.bundle);
    const runs = candidate(f.trust.commit, 35, 120);
    const proposal = promoteSurfaceBaseline(f.load(), runs, now);
    expect(JSON.stringify(f.bundle)).toBe(before);
    expect(proposal.history[0]).toEqual(f.bundle.history[0]);
    expect(proposal.policy).toEqual(f.bundle.policy);
    expect(proposal.history[1]!.parentDigest).toBe(
      surfaceEvidenceDigest(f.bundle.history[0])
    );
    const trust = f.store(proposal);
    const improved = loadTrustedSurfaceBaseline(f.root, trust, now);
    expect(
      compareSurfaceMeasurements(
        improved,
        candidate(candidateHead, 40, 140, 'next', 40),
        candidateHead,
        now
      )
    ).toMatchObject({
      status: 'fail',
      reasons: [expect.stringContaining('regression:')],
    });
    expect(
      compareSurfaceMeasurements(
        improved,
        candidate(candidateHead, 35, 120, 'next', 40),
        candidateHead,
        now
      ).status
    ).toBe('pass');
    expect(() =>
      promoteSurfaceBaseline(
        improved,
        candidate(candidateHead, 35, 120, 'next', 40),
        now
      )
    ).toThrow('candidate head mismatch');
    expect(readFileSync(join(f.root, 'baseline.json'), 'utf8')).toContain(
      'baseline-desktop'
    );
  });

  it('rejects history rewriting, missing history surfaces, and failed historical first attempts', () => {
    const cases = [
      (bundle: SurfaceBaselineBundle) => ({
        ...bundle,
        history: [{ ...bundle.history[0]!, parentDigest: '0'.repeat(64) }],
      }),
      (bundle: SurfaceBaselineBundle) => ({
        ...bundle,
        history: [
          { ...bundle.history[0]!, runs: bundle.history[0]!.runs.slice(1) },
        ],
      }),
      (bundle: SurfaceBaselineBundle) => ({
        ...bundle,
        history: [
          {
            ...bundle.history[0]!,
            runs: bundle.history[0]!.runs.map((control, index) =>
              index === 0 ? { ...control, status: 'fail' as const } : control
            ),
          },
        ],
      }),
      (bundle: SurfaceBaselineBundle) => ({ ...bundle, history: [] }),
    ];
    for (const change of cases) expect(fixture(change).load).toThrow();
  });

  it('fails missing and malformed file evidence through the report entry point', () => {
    const f = fixture();
    const trustFile = join(f.root, 'host-trust.json');
    const candidateFile = join(f.root, 'candidate.json');
    expect(
      runSurfaceComparison(f.root, trustFile, candidateFile, candidateHead, now)
        .status
    ).toBe('fail');
    writeFileSync(trustFile, JSON.stringify(f.trust));
    writeFileSync(candidateFile, JSON.stringify({ runs: candidate() }));
    expect(
      runSurfaceComparison(f.root, trustFile, candidateFile, candidateHead, now)
        .status
    ).toBe('pass');
    writeFileSync(candidateFile, '{}');
    expect(
      runSurfaceComparison(f.root, trustFile, candidateFile, candidateHead, now)
        .status
    ).toBe('fail');
  });

  it('returns real CLI exit codes for passing, regressing, and missing evidence', () => {
    const offset = Date.now() - now;
    const shift = (value: string) =>
      new Date(Date.parse(value) + offset).toISOString();
    const shiftRuns = (runs: readonly SurfaceAttempt[]) =>
      runs.map(run => ({
        ...run,
        startedAt: shift(run.startedAt),
        completedAt: shift(run.completedAt),
      }));
    const f = fixture(bundle => ({
      ...bundle,
      policy: { ...bundle.policy, declaredAt: shift(bundle.policy.declaredAt) },
      controls: shiftRuns(bundle.controls),
      history: bundle.history.map(entry => ({
        ...entry,
        runs: shiftRuns(entry.runs),
      })),
    }));
    const trustFile = join(f.root, 'host-trust.json');
    const candidateFile = join(f.root, 'candidate.json');
    writeFileSync(trustFile, JSON.stringify(f.trust));
    const cli = (...args: string[]) =>
      spawnSync(
        process.execPath,
        [
          '--import',
          import.meta.resolve('tsx'),
          fileURLToPath(
            new URL('./performance-surface-compare.ts', import.meta.url)
          ),
          ...args,
        ],
        { cwd: f.root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }
      );
    for (const [feedback, status] of [
      [35, 0],
      [45, 1],
    ]) {
      writeFileSync(
        candidateFile,
        JSON.stringify({ runs: shiftRuns(candidate(candidateHead, feedback)) })
      );
      const result = cli(trustFile, candidateFile, candidateHead);
      expect(result.status, result.stderr).toBe(status);
      expect(result.stdout, result.stderr).not.toBe('');
      expect(JSON.parse(result.stdout).status).toBe(
        status === 0 ? 'pass' : 'fail'
      );
    }
    expect(cli().status).toBe(1);
    expect(
      cli(trustFile, join(f.root, 'missing.json'), candidateHead).status
    ).toBe(1);
  });
});
