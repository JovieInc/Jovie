import { describe, expect, it } from 'vitest';
import { runCheck } from '../../golden-path-assurance.mjs';
import {
  checkMapRatchet,
  checkModuleBaselines,
  classifyStatus,
  measureCoverageMap,
  parseCoverageMap,
  priorityWeights,
  rankModules,
  referencedTestFiles,
  unresolvedReferences,
} from '../golden-path-assurance.mjs';

const row = (id, status, test = 'a/b.test.ts') =>
  `| ${id} | step | variant | ${test} | unit | ${status} | green |`;

describe('golden path coverage map', () => {
  it('passes against the committed map, manifest and baselines', () => {
    const { failures } = runCheck();
    expect(failures).toEqual([]);
  });

  it('classifies every status the map uses', () => {
    expect(classifyStatus('REAL')).toBe('REAL');
    expect(classifyStatus('REAL, SKIPPED-GATED (seed)')).toBe('REAL_GATED');
    expect(classifyStatus('REAL (needs DB fixture, gated)')).toBe('REAL_GATED');
    expect(classifyStatus('MOCKED (db)')).toBe('MOCKED');
    expect(classifyStatus('SKIPPED-GATED (env)')).toBe('SKIPPED_GATED');
    expect(classifyStatus('MISSING')).toBe('MISSING');
    expect(classifyStatus('N/A')).toBe('NA');
    expect(() => classifyStatus('MAYBE')).toThrow(/unrecognised/u);
  });

  it('rejects malformed and duplicate rows', () => {
    expect(() => parseCoverageMap('| X1 | a | b |')).toThrow(/7 cells/u);
    expect(() =>
      parseCoverageMap([row('X1', 'REAL'), row('X1', 'MOCKED')].join('\n'))
    ).toThrow(/duplicate/u);
  });

  it('expands brace shorthand when reading test references', () => {
    expect(
      referencedTestFiles('golden-path-admission.{marker,server}.test.ts')
    ).toEqual([
      'golden-path-admission.marker.test.ts',
      'golden-path-admission.server.test.ts',
    ]);
  });
});

describe('golden path ratchets (deliberate red)', () => {
  const baseline = {
    map: { rowsFloor: 3, realFloor: 1, missingCeiling: 1 },
    mutation: { pendingBaseline: ['lib/a.ts'] },
  };

  it('fails when a gap is added, a real row is lost or a row is deleted', () => {
    const ok = measureCoverageMap(
      parseCoverageMap(
        [row('A1', 'REAL'), row('A2', 'MOCKED'), row('A3', 'MISSING')].join(
          '\n'
        )
      )
    );
    expect(checkMapRatchet(ok, baseline)).toEqual([]);

    const moreMissing = measureCoverageMap(
      parseCoverageMap(
        [row('A1', 'REAL'), row('A2', 'MISSING'), row('A3', 'MISSING')].join(
          '\n'
        )
      )
    );
    expect(checkMapRatchet(moreMissing, baseline).join()).toMatch(
      /missing rows 2 > ceiling 1/u
    );

    const lostReal = measureCoverageMap(
      parseCoverageMap(
        [row('A1', 'MOCKED'), row('A2', 'MOCKED'), row('A3', 'MISSING')].join(
          '\n'
        )
      )
    );
    expect(checkMapRatchet(lostReal, baseline).join()).toMatch(
      /real-path rows 0 < floor 1/u
    );

    const deleted = measureCoverageMap(
      parseCoverageMap([row('A1', 'REAL'), row('A2', 'MOCKED')].join('\n'))
    );
    expect(checkMapRatchet(deleted, baseline).join()).toMatch(
      /cannot be deleted/u
    );
  });

  it('fails a row that names a test file the repo does not track', () => {
    const rows = parseCoverageMap(
      [
        row('A1', 'MOCKED', 'tests/unit/gone.test.ts'),
        row('A2', 'MISSING', 'none'),
      ].join('\n')
    );
    expect(
      unresolvedReferences(rows, ['apps/web/tests/unit/here.test.ts']).join()
    ).toMatch(/A1: tests\/unit\/gone\.test\.ts is not a tracked file/u);
    expect(
      unresolvedReferences(rows, ['apps/web/tests/unit/gone.test.ts'])
    ).toEqual([]);
  });

  it('fails a module with no floor, and a floored module left in pendingBaseline', () => {
    const manifest = { modules: [{ path: 'lib/a.ts' }, { path: 'lib/b.ts' }] };
    expect(
      checkModuleBaselines(manifest, { files: {} }, baseline).join()
    ).toMatch(/lib\/b\.ts: no mutation floor/u);
    expect(
      checkModuleBaselines(
        manifest,
        { files: { 'lib/a.ts': {}, 'lib/b.ts': {} } },
        baseline
      ).join()
    ).toMatch(
      /lib\/a\.ts: has a mutation floor, remove it from pendingBaseline/u
    );
  });
});

describe('traffic priority', () => {
  const manifest = {
    riskWeights: { money: 5, routing: 2 },
    stageVolume30d: { paid: 1, 'profile-view': 1000 },
    modules: [
      { path: 'lib/pay.ts', stage: 'paid', risk: 'money' },
      { path: 'lib/view.ts', stage: 'profile-view', risk: 'routing' },
    ],
  };

  it('ranks by stage volume x risk and lets live counts override the snapshot', () => {
    expect(rankModules(manifest).map(entry => entry.path)).toEqual([
      'lib/view.ts',
      'lib/pay.ts',
    ]);
    expect(
      rankModules(manifest, { paid: 5000 }).map(entry => entry.path)
    ).toEqual(['lib/pay.ts', 'lib/view.ts']);
    expect(priorityWeights(rankModules(manifest)).get('lib/view.ts')).toBe(
      2002
    );
  });
});
