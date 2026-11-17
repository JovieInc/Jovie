import { describe, expect, it } from 'vitest';
import { inputDigest } from '../mutation-inputs.mjs';
import { buildSurvivorDraftBatches } from '../mutation-survivor-drafts.mjs';

const sha = 'a'.repeat(40);
const configDigest = 'config';
const read = path => `source:${path}`;
function fixture(file) {
  const inputs = [file, `${file}.test.ts`];
  const evidence = {
    schemaVersion: 1,
    configDigest,
    runId: 1,
    verdict: 'pass',
    inputs,
    inputDigest: inputDigest(inputs, read),
  };
  const task = {
    file,
    sha,
    score: 90,
    valid: 30,
    tests: [`${file}.test.ts`],
    evidence,
    survivors: [
      {
        file,
        fingerprint: 'c'.repeat(16),
        line: 1,
        status: 'Survived',
        mutator: 'BooleanLiteral',
        original: 'true',
        replacement: 'false',
        context: '1: return true',
      },
    ],
  };
  return { task, entry: { ...task, status: 'scored' } };
}
function run(tasks, entries, options = {}) {
  return buildSurvivorDraftBatches(tasks, {
    state: { modules: entries },
    configDigest,
    read,
    ...options,
  });
}

describe('survivor drafts', () => {
  it('batches twenty modules per directory in stable order without new issue identities', () => {
    const fixtures = Array.from({ length: 21 }, (_, i) =>
      fixture(`lib/a/m${String(i).padStart(2, '0')}.ts`)
    );
    fixtures.push(fixture('lib/b/one.ts'));
    const tasks = fixtures.map(f => f.task);
    const state = Object.fromEntries(fixtures.map(f => [f.task.file, f.entry]));
    const result = run([...tasks].reverse(), state);
    expect(result.skipped).toEqual([]);
    expect(result.batches.map(b => [b.directory, b.modules.length])).toEqual([
      ['lib/a', 20],
      ['lib/a', 1],
      ['lib/b', 1],
    ]);
    expect(result.batches.every(b => b.approvalRequired)).toBe(true);
    expect(result.batches[0].modules[0]).toMatchObject({
      fingerprint: 'mutation-survivors:lib/a/m00.ts',
      title:
        '[mutation-survivors:lib/a/m00.ts] lib/a/m00.ts: 1 surviving mutant(s), score 90%',
    });
    expect(result.batches[0].modules[0].description).toContain(
      'Tested SHA: ' + sha
    );
    expect(result.batches[0]).not.toHaveProperty('fingerprint');
    expect(run(tasks, state)).toEqual(result);
  });

  it('annotates exact existing task matches without changing ownership or attempts', () => {
    const { task, entry } = fixture('lib/a.ts');
    const existing = {
      id: 'issue-id',
      identifier: 'JOV-1',
      url: 'https://linear.app/issue/JOV-1',
      title: '[mutation-survivors:lib/a.ts] prior result',
      assignee: 'Elsa',
      attempts: 3,
      lease: 'owned',
    };
    const before = structuredClone(existing);
    const result = run(
      [task],
      { [task.file]: entry },
      {
        existingIssues: [
          existing,
          { id: 'unrelated', title: '[mutation-survivors:lib/a.tsx] other' },
        ],
      }
    );
    expect(result.batches[0].modules[0].existingIssues).toEqual([
      { id: 'issue-id', identifier: 'JOV-1', url: existing.url },
    ]);
    expect(existing).toEqual(before);
  });

  it.each([
    'timeout',
    'stale-input',
    'stale-task',
    'unknown',
    'no-survivors',
    'different-sha',
  ])('leaves %s evidence out of actionable drafts', reason => {
    const { task, entry } = fixture('lib/a.ts');
    if (reason === 'timeout') entry.status = 'error';
    if (reason === 'stale-input') entry.evidence.inputDigest = 'stale';
    if (reason === 'stale-task') task.evidence = { ...task.evidence, runId: 0 };
    if (reason === 'unknown') entry.evidence.verdict = 'unknown';
    if (reason === 'no-survivors') task.survivors = [];
    if (reason === 'different-sha') task.sha = 'b'.repeat(40);
    const result = run([task], { [task.file]: entry });
    expect(result.batches).toEqual([]);
    expect(result.skipped).toHaveLength(1);
  });

  it('deduplicates repeated module JSON and preserves known floor regressions as drafts', () => {
    const { task, entry } = fixture('packages/ui/atoms/a.tsx');
    entry.evidence.verdict = 'regression';
    const result = run([task, task], { [task.file]: entry });
    expect(result.batches[0].modules).toHaveLength(1);
    expect(result.skipped).toEqual([
      { file: task.file, reason: 'duplicate module task' },
    ]);
  });
});
