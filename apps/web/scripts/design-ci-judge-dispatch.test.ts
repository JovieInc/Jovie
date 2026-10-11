// @vitest-environment node
//
// Imports scripts/invariants/jev-gateway.mjs and scripts/vision/art-evaluator.mjs,
// which resolve their own paths through the global `URL` at load time; under
// jsdom that global is a polyfill and `fileURLToPath` rejects it.
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it, vi } from 'vitest';
import {
  type ArtEvaluatorModule,
  buildLiveJudges,
  classifyScore,
  type DispatchDeps,
  dispatchJudgeCells,
  fixtureJudges,
  formatDispatchReport,
  type JevGatewayModule,
  jevCheapJudge,
  parseFlagshipReply,
  pickRoleModel,
  type RouteJudges,
  resolversFromInputs,
  runClassifierFirst,
  type StageJudge,
  scoreJevReceipt,
  textFlagshipJudge,
  visionAvailability,
  visionJudge,
} from './design-ci-judge-dispatch';
import {
  type CertifiableUnit,
  type DesignCiJudgeMatrix,
  fingerprintCells,
  type JudgeRoute,
  REPO_ROOT,
  type RoutedInvariantRow,
} from './design-ci-judge-router';

const unit: CertifiableUnit = {
  id: 'marketing-component:shell.footer',
  kind: 'marketing-component',
  sourceId: 'shell.footer',
  sources: ['apps/web/package.json'],
  products: ['web'],
  surfaceTags: ['marketing'],
};

function row(rowId: string, route: JudgeRoute): RoutedInvariantRow {
  return {
    rowId,
    invariantId: rowId.split('#')[0] ?? rowId,
    ruleId: null,
    title: `${rowId} title`,
    products: ['*'],
    surfaces: ['*'],
    route,
    routeEvidence: [`evidence-for-${rowId}`],
    policyFingerprintSource: { rule: rowId },
  };
}

function matrixOf(routes: readonly JudgeRoute[]): DesignCiJudgeMatrix {
  const rows = routes.map((route, index) => row(`JOV-INV-9${index}`, route));
  return {
    generatedAt: '2026-09-29T00:00:00.000Z',
    rows,
    units: [unit],
    cells: rows.map(r => ({
      rowId: r.rowId,
      unitId: unit.id,
      route: r.route,
      state: 'insufficient' as const,
      insufficientReason: 'not-yet-evaluated' as const,
    })),
  };
}

const noCredentials: StageJudge = {
  id: null,
  run: () => Promise.reject(new Error('must not run without credentials')),
};
const offline: RouteJudges = { cheap: noCredentials, flagship: noCredentials };

function deps(overrides: Partial<DispatchDeps> = {}): DispatchDeps {
  return {
    mode: 'live',
    jev: offline,
    visual: offline,
    now: () => '2026-09-29T12:00:00.000Z',
    ...overrides,
  };
}

const allInputs = resolversFromInputs({
  text: { [unit.id]: { stage: 'copy', state: 'One link for every fan.' } },
  captures: { [unit.id]: '/captures/footer.png' },
});

describe('classifier-first bands', () => {
  it('passes above 0.7, fails below 0.4, and escalates the closed 0.4-0.7 band', () => {
    expect(classifyScore(0.71)).toBe('pass');
    expect(classifyScore(0.7)).toBe('borderline');
    expect(classifyScore(0.4)).toBe('borderline');
    expect(classifyScore(0.39)).toBe('fail');
  });
});

describe('dispatchJudgeCells', () => {
  it('reports credentials-unavailable in CI without secrets, never a fake pass', async () => {
    const result = await dispatchJudgeCells(
      matrixOf(['jev', 'visual']),
      deps({ ...allInputs })
    );
    expect(result.dispatched).toHaveLength(2);
    for (const cell of result.dispatched) {
      expect(cell.state).toBe('insufficient');
      expect(cell.dispatchReason).toBe('credentials-unavailable');
      expect(cell.evidence).toContain('dispatch:credentials-unavailable');
    }
  });

  it('reports missing text and missing captures instead of calling a judge', async () => {
    const run = vi.fn();
    const judges = fixtureJudges({ '*': { cheap: { score: 0.9 } } });
    const spied: RouteJudges = {
      cheap: { id: judges.cheap.id, run },
      flagship: judges.flagship,
    };
    const result = await dispatchJudgeCells(
      matrixOf(['jev', 'visual']),
      deps({ jev: spied, visual: spied })
    );
    expect(result.dispatched.map(cell => cell.dispatchReason)).toEqual([
      'no-text-evidence',
      'no-rendered-artifact',
    ]);
    expect(run).not.toHaveBeenCalled();
  });

  it('queues human cells as non-blocking post-ship taste items', async () => {
    const result = await dispatchJudgeCells(matrixOf(['human']), deps());
    expect(result.tasteQueue).toEqual([
      {
        cellId: `JOV-INV-90::${unit.id}`,
        rowId: 'JOV-INV-90',
        unitId: unit.id,
        title: 'JOV-INV-90 title',
        queuedAt: '2026-09-29T12:00:00.000Z',
        blocking: false,
      },
    ]);
    expect(result.dispatched[0]?.state).toBe('insufficient');
    expect(result.dispatched[0]?.dispatchReason).toBe('queued-post-ship');
  });

  it('leaves deterministic and unroutable cells untouched', async () => {
    const matrix = matrixOf(['deterministic', 'insufficient']);
    const result = await dispatchJudgeCells(matrix, deps());
    expect(result.dispatched).toEqual([]);
    expect(result.matrix.cells).toEqual(matrix.cells);
  });

  it('dry mode plans without running any judge', async () => {
    const result = await dispatchJudgeCells(
      matrixOf(['jev', 'visual']),
      deps({ mode: 'dry', ...allInputs })
    );
    expect(result.dispatched.every(c => c.dispatchReason === 'dry-run')).toBe(
      true
    );
  });

  it('fixture mode: a confident cheap score decides without the flagship', async () => {
    const judges = fixtureJudges({
      '*': { cheap: { score: 0.92 }, flagship: { score: 0.01 } },
    });
    const result = await dispatchJudgeCells(
      matrixOf(['jev', 'visual']),
      deps({ mode: 'fixture', jev: judges, visual: judges, ...allInputs })
    );
    for (const cell of result.dispatched) {
      expect(cell.state).toBe('pass');
      expect(cell.escalated).toBe(false);
      expect(cell.judges.map(j => j.judge)).toEqual(['fixture/cheap']);
    }
    expect(formatDispatchReport(result)).toContain('escalated to flagship: 0');
  });

  it('fixture mode: a borderline score escalates and the flagship verdict is final', async () => {
    const judges = fixtureJudges({
      '*': { cheap: { score: 0.55 }, flagship: { score: 0.1 } },
    });
    const result = await dispatchJudgeCells(
      matrixOf(['visual']),
      deps({ mode: 'fixture', visual: judges, ...allInputs })
    );
    const [cell] = result.dispatched;
    expect(cell?.state).toBe('fail');
    expect(cell?.escalated).toBe(true);
    expect(cell?.evidence).toContain('dispatch:escalated-to-flagship');
    expect(cell?.judges.map(j => j.judge)).toEqual([
      'fixture/cheap',
      'fixture/flagship',
    ]);
  });

  it('stops at the call budget and says so', async () => {
    const judges = fixtureJudges({ '*': { cheap: { score: 0.9 } } });
    const matrix = matrixOf(['jev', 'jev', 'jev']);
    const result = await dispatchJudgeCells(
      matrix,
      deps({ jev: judges, maxJudgeCalls: 2, ...allInputs })
    );
    expect(result.dispatched.map(c => c.state)).toEqual([
      'pass',
      'pass',
      'insufficient',
    ]);
    expect(result.dispatched[2]?.dispatchReason).toBe('budget-exhausted');
  });
});

describe('runClassifierFirst failure paths', () => {
  const input = {
    row: row('JOV-INV-1', 'visual'),
    unit,
    cellId: 'c',
    text: null,
    capture: '/x.png',
  };
  const spendAlways = () => true;

  it('a borderline score with no reachable flagship stays insufficient', async () => {
    const decision = await runClassifierFirst(
      input,
      {
        cheap: fixtureJudges({ '*': { cheap: { score: 0.5 } } }).cheap,
        flagship: noCredentials,
      },
      spendAlways
    );
    expect(decision.state).toBe('insufficient');
    expect(decision.reason).toBe('credentials-unavailable');
    expect(decision.escalated).toBe(true);
  });

  it('a throwing judge is a judge-error, not a pass', async () => {
    const decision = await runClassifierFirst(
      input,
      {
        cheap: { id: 'x/y', run: () => Promise.reject(new Error('boom')) },
        flagship: noCredentials,
      },
      spendAlways
    );
    expect(decision.state).toBe('insufficient');
    expect(decision.reason).toBe('judge-error');
    expect(decision.judges[0]?.notes).toBe('boom');
  });

  it('a flagship that cannot decide leaves the cell insufficient', async () => {
    const judges = fixtureJudges({ '*': { cheap: { score: 0.6 } } });
    const decision = await runClassifierFirst(input, judges, spendAlways);
    expect(decision.state).toBe('insufficient');
    expect(decision.judges).toHaveLength(2);
  });

  it('never spends a flagship call past the budget', async () => {
    let calls = 0;
    const decision = await runClassifierFirst(
      input,
      fixtureJudges({
        '*': { cheap: { score: 0.5 }, flagship: { score: 0.9 } },
      }),
      () => ++calls <= 1
    );
    expect(decision.reason).toBe('budget-exhausted');
  });
});

describe('jev judge', () => {
  it('maps receipts to scores; hesitant verdicts land in the borderline band', () => {
    expect(
      scoreJevReceipt(
        {
          status: 'evaluated',
          alignment: 'supported',
          probabilities: { supported: 0.55 },
        },
        'jev'
      ).score
    ).toBe(0.55);
    expect(
      scoreJevReceipt({ status: 'evaluated', alignment: 'contradicted' }, 'jev')
    ).toMatchObject({ score: 0, verdict: 'fail' });
    expect(
      scoreJevReceipt(
        { status: 'evaluated', alignment: 'needs-specialist' },
        'jev'
      )
    ).toMatchObject({ verdict: 'insufficient', reason: 'needs-specialist' });
    expect(scoreJevReceipt({ status: 'not-admitted' }, 'jev').reason).toBe(
      'not-admitted'
    );
    expect(scoreJevReceipt({ status: 'timeout' }, 'jev').reason).toBe(
      'judge-error'
    );
  });

  it('is unavailable without a gateway credential', async () => {
    const gatewayModule = (await import(
      '../../../scripts/invariants/jev-gateway.mjs'
    )) as unknown as JevGatewayModule;
    expect(
      jevCheapJudge({
        module: gatewayModule,
        apiKey: undefined,
        sourceSha: 'a'.repeat(40),
      }).id
    ).toBeNull();
  });

  it('runs the real jev-gateway admission: no operator approval means not-admitted, no transport call', async () => {
    const gatewayModule = (await import(
      '../../../scripts/invariants/jev-gateway.mjs'
    )) as unknown as JevGatewayModule;
    const transport = vi.fn();
    const judge = jevCheapJudge({
      module: gatewayModule,
      apiKey: 'test-only-placeholder',
      sourceSha: 'a'.repeat(40),
      transport,
    });
    expect(judge.id).toBe('typesafe-ai/jev');
    const score = await judge.run({
      row: row('JOV-INV-1', 'jev'),
      unit,
      cellId: 'JOV-INV-1::unit',
      text: { stage: 'copy', state: 'One link for every fan.' },
      capture: null,
    });
    expect(score).toMatchObject({
      verdict: 'insufficient',
      reason: 'not-admitted',
    });
    expect(transport).not.toHaveBeenCalled();
  });

  it('refuses an unknown rubric stage before any request', async () => {
    const gatewayModule = (await import(
      '../../../scripts/invariants/jev-gateway.mjs'
    )) as unknown as JevGatewayModule;
    const score = await jevCheapJudge({
      module: gatewayModule,
      apiKey: 'test-only-placeholder',
      sourceSha: 'a'.repeat(40),
    }).run({
      row: row('JOV-INV-1', 'jev'),
      unit,
      cellId: 'c',
      text: { stage: 'not-a-stage', state: 'x' },
      capture: null,
    });
    expect(score.reason).toBe('no-text-evidence');
  });
});

describe('flagship text judge', () => {
  it('parses replies and fails closed on garbage', () => {
    expect(
      parseFlagshipReply('{"status":"pass","confidence":0.8}', 'm')
    ).toMatchObject({ verdict: 'pass', score: 0.8 });
    expect(
      parseFlagshipReply('```{"status":"fail","confidence":0.9}```', 'm').score
    ).toBeCloseTo(0.1);
    expect(parseFlagshipReply('no json', 'm').reason).toBe('judge-error');
    expect(parseFlagshipReply('{"status":"insufficient"}', 'm').verdict).toBe(
      'insufficient'
    );
  });

  it('seats a flagship from another family than the generator', async () => {
    const transport = Object.assign(
      vi.fn(async () => '{"status":"pass","confidence":0.95}'),
      { available: () => true }
    );
    const judge = textFlagshipJudge({
      transport,
      generatorModel: 'anthropic/claude-opus-5.5',
    });
    expect(judge.id).toBe('openai/gpt-5.6-sol');
    const score = await judge.run({
      row: row('JOV-INV-1', 'jev'),
      unit,
      cellId: 'c',
      text: { stage: 'copy', state: 'One link.' },
      capture: null,
    });
    expect(score.verdict).toBe('pass');
    expect(transport).toHaveBeenCalledWith(
      expect.objectContaining({ model: 'openai/gpt-5.6-sol' })
    );
  });

  it('has no id when nothing in the role is reachable', () => {
    const transport = Object.assign(vi.fn(), { available: () => false });
    expect(textFlagshipJudge({ transport }).id).toBeNull();
  });
});

describe('vision judge via art-evaluator', () => {
  const dir = mkdtempSync(join(tmpdir(), 'dispatch-vision-'));
  const capture = join(dir, 'capture.png');
  writeFileSync(capture, 'not-really-a-png');
  afterAll(() => rmSync(dir, { recursive: true, force: true }));

  it('picks a cheap vision judge and a cross-family flagship, subscriptions only', () => {
    const available = visionAvailability(() => true);
    const cheap = pickRoleModel('vision-judge', {
      available,
      modality: 'vision',
    });
    expect(cheap).toBe('anthropic/claude-sonnet-5');
    expect(
      pickRoleModel('judge-flagship', {
        available,
        modality: 'vision',
        excludeFamilyOf: cheap,
      })
    ).toBe('openai/gpt-5.6-sol');
    expect(available('zai/glm-5.3')).toBe(false);
  });

  it('scores a real evaluateArt verdict with the judge confidence', async () => {
    const artModule = (await import(
      '../../../scripts/vision/art-evaluator.mjs'
    )) as unknown as ArtEvaluatorModule;
    const transport = vi.fn(
      async () =>
        '{"status":"pass","focalPoint":"headline","competing":[],"identityDrift":[],"notes":"clean","confidence":0.6}'
    );
    const judge = visionJudge({
      module: artModule,
      transport,
      model: 'anthropic/claude-sonnet-5',
    });
    const score = await judge.run({
      row: row('JOV-INV-038#progressive-depth', 'visual'),
      unit,
      cellId: 'c',
      text: null,
      capture,
    });
    expect(score).toMatchObject({ verdict: 'pass', score: 0.6 });
    expect(classifyScore(score.score ?? 0)).toBe('borderline');
    expect(transport).toHaveBeenCalledWith(
      expect.objectContaining({ images: [capture] })
    );
  });

  it('a competing element fails the cell; a broken reply is a judge-error', async () => {
    const artModule = (await import(
      '../../../scripts/vision/art-evaluator.mjs'
    )) as unknown as ArtEvaluatorModule;
    const failing = visionJudge({
      module: artModule,
      transport: async () =>
        '{"status":"pass","focalPoint":null,"competing":["two-dominant-ctas"],"identityDrift":[],"notes":"","confidence":0.9}',
      model: 'openai/gpt-5.6-luna',
    });
    const input = {
      row: row('JOV-INV-1', 'visual'),
      unit,
      cellId: 'c',
      text: null,
      capture,
    };
    expect(await failing.run(input)).toMatchObject({ verdict: 'fail' });
    const broken = visionJudge({
      module: artModule,
      transport: async () => 'I cannot see the image',
      model: 'openai/gpt-5.6-luna',
    });
    expect((await broken.run(input)).reason).toBe('judge-error');
    expect(
      (await broken.run({ ...input, capture: join(dir, 'missing.png') })).reason
    ).toBe('no-rendered-artifact');
  });
});

describe('router persistence of dispatched cells', () => {
  it('a state change rewrites the cell instead of skipping it as unchanged', async () => {
    const matrix = matrixOf(['visual']);
    const judges = fixtureJudges({ '*': { cheap: { score: 0.95 } } });
    const before = await fingerprintCells(
      (await dispatchJudgeCells(matrix, deps({ ...allInputs }))).matrix,
      REPO_ROOT
    );
    const after = await fingerprintCells(
      (
        await dispatchJudgeCells(
          matrix,
          deps({ mode: 'fixture', visual: judges, ...allInputs })
        )
      ).matrix,
      REPO_ROOT
    );
    expect(before[0]?.state).toBe('insufficient');
    expect(after[0]?.state).toBe('pass');
    expect(after[0]?.inputFingerprint).not.toBe(before[0]?.inputFingerprint);
    expect(after[0]?.evidence).toEqual(
      expect.arrayContaining([
        'evidence-for-JOV-INV-90',
        expect.stringMatching(/^judge:fixture\/cheap verdict=pass/),
      ])
    );
  });
});

describe('buildLiveJudges', () => {
  it('wires the real modules and leaves jev without an id when the gateway key is absent', async () => {
    const judges = await buildLiveJudges({
      env: { NODE_ENV: 'test' },
      sourceSha: 'a'.repeat(40),
    });
    expect(judges.jev.cheap.id).toBeNull();
    for (const stage of [judges.visual.cheap, judges.visual.flagship]) {
      // Seated only on a reachable subscription CLI; never a gateway family.
      if (stage.id) expect(stage.id).toMatch(/^(anthropic|openai)\//);
    }
  });
});
