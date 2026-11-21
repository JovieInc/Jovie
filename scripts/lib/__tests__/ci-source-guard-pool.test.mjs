import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  DESIGN_CI_JUDGE_VITEST_MARKER,
  DESIGN_CI_JUDGE_VITEST_PATHS,
  expandSourcePoolEntries,
  filterMergedWithBasePoolEntries,
  MERGED_WITH_BASE_POOL_CONCURRENCY,
  MERGED_WITH_BASE_POOL_LONG_POLES,
  MERGED_WITH_BASE_POOL_SPEC,
  mergedWithBasePoolConcurrency,
  PR_CHEAP_SCAN_COMMANDS,
  runSourceGuardPool,
  runSourceGuards,
  SOURCE_GUARDS,
  sourceGuardConcurrency,
  sourceGuardLocks,
} from '../../ci-fast-lanes.mjs';

describe('source guard pool', () => {
  afterEach(() => vi.unstubAllEnvs());

  it('runs every guard even after one fails (run-all)', async () => {
    const guards = [
      { id: 'a', command: 'pass-a' },
      { id: 'b', command: 'fail-b' },
      { id: 'c', command: 'pass-c' },
    ];
    const execute = vi.fn(command =>
      Promise.resolve({
        code: command === 'fail-b' ? 2 : 0,
        output: `${command} out\n`,
      })
    );
    const { code } = await runSourceGuards(guards, { execute });
    expect(code).toBe(2);
    expect(execute.mock.calls.map(([command]) => command)).toEqual([
      'pass-a',
      'fail-b',
      'pass-c',
    ]);
  });

  it('exits with the FIRST failing guard in list order', async () => {
    const guards = [
      { id: 'a', command: 'ok' },
      { id: 'b', command: 'fail-7' },
      { id: 'c', command: 'fail-9' },
    ];
    const { code } = await runSourceGuards(guards, {
      execute: async command =>
        command === 'ok'
          ? { code: 0, output: '' }
          : { code: command === 'fail-7' ? 7 : 9, output: '' },
    });
    expect(code).toBe(7);
  });

  it('prints contiguous list-order blocks wrapped in stop-commands windows', async () => {
    const guards = [
      { id: 'first', command: 'c1' },
      { id: 'second', command: 'c2' },
      { id: 'third', command: 'c3' },
    ];
    // Completion order deliberately reversed; output must stay in list order.
    const execute = async command => {
      await new Promise(resolveDone =>
        setTimeout(resolveDone, command === 'c1' ? 30 : 1)
      );
      return {
        code: command === 'c2' ? 1 : 0,
        output: `${command}-out\n`,
      };
    };
    const { code, output } = await runSourceGuards(guards, { execute });
    expect(code).toBe(1);
    const lines = output.split('\n');
    // One stop-commands window per guard, in list order.
    const openers = lines.filter(line => line.startsWith('::stop-commands::'));
    const closers = lines.filter(line => /^::[0-9a-f-]{36}::$/u.test(line));
    expect(openers).toHaveLength(3);
    expect(closers).toHaveLength(3);
    for (const opener of openers) {
      const token = opener.slice('::stop-commands::'.length);
      expect(lines).toContain(`::${token}::`);
    }
    const summaryIndexes = [];
    for (const [index, line] of lines.entries()) {
      if (line.startsWith('[source-guards] ')) summaryIndexes.push(index);
    }
    expect(summaryIndexes).toHaveLength(3);
    expect(summaryIndexes).toEqual([...summaryIndexes].sort((a, b) => a - b));
    expect(
      lines
        .filter(line => line.startsWith('[source-guards] '))
        .map(line => line.replace(/duration_ms=\d+/u, 'duration_ms=N'))
    ).toEqual([
      '[source-guards] first: exit 0; duration_ms=N',
      '[source-guards] second: exit 1; duration_ms=N',
      '[source-guards] third: exit 0; duration_ms=N',
    ]);
    // A failing guard gets one real annotation.
    expect(
      lines.filter(line => line.startsWith('::error title=source guard'))
    ).toEqual([
      '::error title=source guard second::second failed (exit 1); read its output above.',
    ]);
    // Each guard's output stays contiguous between its window markers.
    const firstOpener = lines.findIndex(line =>
      line.startsWith('::stop-commands::')
    );
    expect(lines[firstOpener + 1]).toBe('c1-out');
  });

  it('serializes guards that share the derived git lock', async () => {
    const guards = [
      {
        id: 'merged',
        command: "bash -c 'git worktree add -q x && git merge -q y'",
      },
      { id: 'other', command: 'node --test a.test.mjs' },
      { id: 'lanes', command: "bash -c 'git fetch -q origin main'" },
    ];
    expect(sourceGuardLocks(guards[0].command)).toContain('git');
    expect(sourceGuardLocks(guards[2].command)).toContain('git');
    expect(sourceGuardLocks(guards[1].command)).not.toContain('git');
    const started = [];
    let inFlightGit = 0;
    let maxInFlightGit = 0;
    const { code } = await runSourceGuards(guards, {
      concurrency: 3,
      execute: async command => {
        if (command.includes('git ')) {
          inFlightGit += 1;
          maxInFlightGit = Math.max(maxInFlightGit, inFlightGit);
        }
        started.push(command);
        await new Promise(resolveDone =>
          setTimeout(
            resolveDone,
            command === "bash -c 'git fetch -q origin main'" ? 20 : 5
          )
        );
        if (command.includes('git ')) inFlightGit -= 1;
        return { code: 0, output: '' };
      },
    });
    expect(code).toBe(0);
    // The two git-touching guards never overlapped.
    expect(maxInFlightGit).toBe(1);
    expect(started).toContain("bash -c 'git fetch -q origin main'");
  });

  it('with concurrency 1 runs guards in strict list order (serial parity)', async () => {
    const guards = [
      { id: 'c', command: 'third' },
      { id: 'a', command: 'first' },
      { id: 'b', command: 'second' },
    ];
    const started = [];
    const { code, output } = await runSourceGuards(guards, {
      concurrency: 1,
      execute: async command => {
        started.push(command);
        return command === 'second'
          ? { code: 5, output: 'x\n' }
          : { code: 0, output: '' };
      },
    });
    expect(started).toEqual(['third', 'first', 'second']);
    expect(code).toBe(5);
    // List order, not completion order.
    expect(output.indexOf('[source-guards] c:')).toBeLessThan(
      output.indexOf('[source-guards] a:')
    );
  });

  it('defaults to at most 3 concurrent guards and honors SOURCE_GUARD_CONCURRENCY', async () => {
    expect(sourceGuardConcurrency('1')).toBe(1);
    expect(sourceGuardConcurrency('7')).toBe(7);
    expect(sourceGuardConcurrency('not-a-number')).toBeLessThanOrEqual(3);
    vi.stubEnv('SOURCE_GUARD_CONCURRENCY', '1');
    const started = [];
    await runSourceGuards(
      [
        { id: 'a', command: 'one' },
        { id: 'b', command: 'two' },
      ],
      {
        execute: async command => {
          started.push(command);
          return { code: 0, output: '' };
        },
      }
    );
    expect(started).toEqual(['one', 'two']);
  });

  it('starts the long-pole guards first when pooling', async () => {
    const guards = [
      { id: 'cheap-a', command: 'a' },
      { id: 'merged-with-base-invariants', command: 'pole1' },
      { id: 'cheap-b', command: 'b' },
      { id: 'script-contracts', command: 'pole2' },
    ];
    const started = [];
    await runSourceGuards(guards, {
      concurrency: 2,
      execute: async command => {
        started.push(command);
        await new Promise(resolveDone => setTimeout(resolveDone, 1));
        return { code: 0, output: '' };
      },
    });
    expect(started.slice(0, 2).sort()).toEqual(['pole1', 'pole2']);
    expect(started).toEqual(['pole1', 'pole2', 'a', 'b']);
  });

  it('derives structural coverage and pytest locks for guard commands too', () => {
    expect(
      sourceGuardLocks(
        'pnpm exec vitest run --coverage lib/__tests__/x.test.mjs'
      )
    ).toEqual(['coverage:.']);
    expect(
      sourceGuardLocks(
        'pnpm exec vitest --root scripts --config vitest.config.mts run --coverage lib/__tests__/x.test.mjs'
      )
    ).toEqual(['coverage:scripts']);
    expect(
      sourceGuardLocks(
        'pnpm exec vitest run --coverage --coverage.reportsDirectory="${RUNNER_TEMP:-/tmp}/jovie-x" lib/__tests__/x.test.mjs'
      )
    ).toEqual(['coverage:${RUNNER_TEMP:-/tmp}/jovie-x']);
    expect(
      sourceGuardLocks(
        'COVERAGE_FILE="${RUNNER_TEMP:-/tmp}/jovie-y.coverage" python3 -m coverage run --branch -m unittest a'
      )
    ).toEqual(['pycoverage:${RUNNER_TEMP:-/tmp}/jovie-y.coverage']);
    expect(sourceGuardLocks('python3 -m pytest -q a.py')).toContain(
      'pytest-cache'
    );
    expect(sourceGuardLocks('node --test a.test.mjs')).toEqual([]);
  });
});

describe('merged-with-base-invariants pool', () => {
  afterEach(() => vi.unstubAllEnvs());

  it('still contains every PR_CHEAP_SCAN_COMMANDS entry plus the design scans', () => {
    const commands = MERGED_WITH_BASE_POOL_SPEC.commands.map(
      entry => entry.command
    );
    for (const command of PR_CHEAP_SCAN_COMMANDS)
      expect(commands, command).toContain(command);
    const guard = SOURCE_GUARDS.find(
      entry => entry.id === 'merged-with-base-invariants'
    );
    expect(guard.command).toContain(
      'node scripts/invariants/design-surfaces.mjs'
    );
    expect(guard.command).toContain('stack-pattern-ratchet.mjs');
    expect(guard.command).toContain('pnpm invariants:check');
    expect(guard.command).toContain('--run-source-guard-pool');
    expect(guard.command).toContain('git worktree add');
    expect(guard.prOnly).toBe(true);
  });

  it('splits the invariants chain into every && segment, none lost', () => {
    const pkg = JSON.parse(
      readFileSync(
        fileURLToPath(new URL('../../../package.json', import.meta.url)),
        'utf8'
      )
    );
    const chain = pkg.scripts['invariants:check'];
    const entries = expandSourcePoolEntries(MERGED_WITH_BASE_POOL_SPEC);
    const expanded = entries.filter(entry =>
      entry.id.startsWith('invariants-check:')
    );
    expect(expanded.length).toBeGreaterThan(10);
    expect(expanded.map(entry => entry.command).join(' && ')).toBe(chain);
  });

  it('falls back to the whole chain when the script is missing', () => {
    const entries = expandSourcePoolEntries(MERGED_WITH_BASE_POOL_SPEC, {});
    expect(entries.filter(entry => entry.id === 'invariants-check')).toEqual([
      { id: 'invariants-check', command: 'pnpm invariants:check' },
    ]);
  });

  it('pins measured long poles so the 70s/61s work starts first', () => {
    const entries = expandSourcePoolEntries(MERGED_WITH_BASE_POOL_SPEC);
    const matched = entries.filter(entry =>
      MERGED_WITH_BASE_POOL_LONG_POLES.some(pole =>
        entry.command.includes(pole)
      )
    );
    // Every pole substring must hit a real expanded command (no stale paths).
    for (const pole of MERGED_WITH_BASE_POOL_LONG_POLES) {
      expect(
        entries.some(entry => entry.command.includes(pole)),
        pole
      ).toBe(true);
    }
    expect(matched.map(entry => entry.command).join('\n')).toContain(
      'design-ci-judge-router'
    );
    expect(matched.map(entry => entry.command).join('\n')).toContain(
      'screen-certification.test.mjs'
    );
    expect(matched.map(entry => entry.command).join('\n')).toContain(
      'gem-priority-gate.test.py'
    );
    expect(matched.map(entry => entry.command).join('\n')).toContain(
      'lint:seo'
    );
  });

  it('does not let SOURCE_GUARD_CONCURRENCY=3 cap the nested pool at 3', () => {
    vi.stubEnv('SOURCE_GUARD_CONCURRENCY', '3');
    // Unset nested override so the documented pool width applies.
    vi.stubEnv('MERGED_WITH_BASE_POOL_CONCURRENCY', undefined);
    const nested = mergedWithBasePoolConcurrency(
      MERGED_WITH_BASE_POOL_CONCURRENCY
    );
    // Old code: Math.min(4, sourceGuardConcurrency()) → 3 under the workflow
    // default. Nested may still be capped by availableParallelism(), but must
    // not inherit the top-level default of 3.
    expect(MERGED_WITH_BASE_POOL_CONCURRENCY).toBe(4);
    expect(nested).toBeGreaterThan(3);
  });

  it('honors SOURCE_GUARD_CONCURRENCY=1 as the serial Validate debug switch', () => {
    vi.stubEnv('SOURCE_GUARD_CONCURRENCY', '1');
    expect(mergedWithBasePoolConcurrency(4)).toBe(1);
  });

  it('honors MERGED_WITH_BASE_POOL_CONCURRENCY over the workflow default', () => {
    vi.stubEnv('SOURCE_GUARD_CONCURRENCY', '3');
    vi.stubEnv('MERGED_WITH_BASE_POOL_CONCURRENCY', '5');
    expect(mergedWithBasePoolConcurrency(4)).toBe(5);
  });

  it('starts measured long-pole subcommands before short scans', async () => {
    const started = [];
    const { code } = await runSourceGuardPool(
      {
        concurrency: 2,
        commands: [
          { id: 'cheap', command: 'node -e "process.exit(0)" /* cheap */' },
          {
            id: 'pole',
            command:
              'node -e "process.exit(0)" /* design-ci-judge-router pole */',
          },
          { id: 'also-cheap', command: 'node -e "process.exit(0)" /* also */' },
        ],
      },
      {
        // Force every entry to run (path-gate fail-closed).
        changedFileList: null,
        execute: async command => {
          started.push(command);
          await new Promise(resolveDone => setTimeout(resolveDone, 5));
          return { code: 0, output: '' };
        },
      }
    );
    expect(code).toBe(0);
    expect(started[0]).toContain('design-ci-judge-router');
  });

  it('path-gates design-ci-judge vitest by related paths', () => {
    const entries = expandSourcePoolEntries(MERGED_WITH_BASE_POOL_SPEC);
    const isJudge = e => e.command.includes(DESIGN_CI_JUDGE_VITEST_MARKER);
    expect(entries.some(isJudge)).toBe(true);
    const { kept, skipped } = filterMergedWithBasePoolEntries(entries, [
      'docs/qa/README.md',
      'scripts/lib/__tests__/ci-source-guard-pool.test.mjs',
    ]);
    expect(skipped.some(isJudge)).toBe(true);
    expect(kept.some(isJudge)).toBe(false);
    expect(
      kept.some(e =>
        e.command.includes('design-ci-judge-router-contract.test.mjs')
      )
    ).toBe(true);
    for (const related of [
      'apps/web/scripts/design-ci-judge-router.ts',
      'apps/web/package.json',
      'apps/web/vitest.config.mts',
      'canon/invariants.jsonl',
      'scripts/invariants/registry.mjs',
      'scripts/invariants/screen-certification.mjs',
      'scripts/invariants/screen-registry.mjs',
      'apps/web/data/appScreens/registry.ts',
      'apps/web/data/marketing/componentRegistry.ts',
    ]) {
      expect(DESIGN_CI_JUDGE_VITEST_PATHS.test(related), related).toBe(true);
      const r = filterMergedWithBasePoolEntries(entries, [related]);
      expect(r.skipped, related).toEqual([]);
      expect(r.kept.some(isJudge), related).toBe(true);
    }
    expect(
      DESIGN_CI_JUDGE_VITEST_PATHS.test('apps/web/app/(home)/page.tsx')
    ).toBe(false);
    for (const changed of [null, undefined, []]) {
      const r = filterMergedWithBasePoolEntries(entries, changed);
      expect(r.skipped, String(changed)).toEqual([]);
      expect(r.kept.length, String(changed)).toBe(entries.length);
    }
  });

  it('logs a skip line and does not execute the gated vitest', async () => {
    const started = [];
    const { code, output } = await runSourceGuardPool(
      {
        concurrency: 2,
        commands: [
          { id: 'cheap', command: 'node -e "process.exit(0)"' },
          {
            id: 'judge',
            command: `pnpm --filter @jovie/web exec vitest run ${DESIGN_CI_JUDGE_VITEST_MARKER}`,
          },
        ],
      },
      {
        changedFileList: ['README.md'],
        execute: async command => {
          started.push(command);
          return { code: 0, output: '' };
        },
      }
    );
    expect(code).toBe(0);
    expect(started).toEqual(['node -e "process.exit(0)"']);
    expect(output).toContain('[merged-with-base] skip: judge;');
    expect(output).toContain('design-ci-judge vitest');
  });

  it('runs every sub-command and fails on any one failure', async () => {
    const spec = {
      concurrency: 4,
      commands: [
        { id: 'ok', command: 'node -e "process.exit(0)"' },
        { id: 'bad', command: 'node -e "process.exit(4)"' },
        { id: 'also-ok', command: 'node -e "process.exit(0)"' },
      ],
    };
    const { code, output } = await runSourceGuardPool(spec, {
      changedFileList: null,
    });
    expect(code).toBe(4);
    // Run-all: the command after the failure still ran.
    expect(output).toContain('[merged-with-base] ok: exit 0;');
    expect(output).toContain('[merged-with-base] bad: exit 4;');
    expect(output).toContain('[merged-with-base] also-ok: exit 0;');
  });
});

describe('Source Validation disk-read guards', () => {
  it('call the bounded pool instead of a serial spawnSync loop', () => {
    const workflow = readFileSync(
      fileURLToPath(
        new URL(
          '../../../.github/workflows/source-validation.yml',
          import.meta.url
        )
      ),
      'utf8'
    );
    const step = workflow.slice(
      workflow.indexOf('Validate disk-read source contracts from trusted base')
    );
    const body = step.slice(0, step.indexOf('\n      - name:', 10));
    expect(body).toContain('runSourceGuards');
    expect(body).toContain('ci-source-guard-pool.mjs');
    expect(body).toContain(
      'SOURCE_GUARD_CONCURRENCY="${SOURCE_GUARD_CONCURRENCY:-3}"'
    );
    expect(body).not.toContain('spawnSync(guard.command');
  });
});
