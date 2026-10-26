import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';

const dir = '/tmp/summer-independent-gate/mutants';
mkdirSync(dir, { recursive: true });
const sourcePath =
  '/workspace/Jovie/scripts/lib/promotion-journey-evidence.mjs';
const source = readFileSync(sourcePath, 'utf8');
const base = readFileSync(
  '/tmp/summer-independent-gate/promotion-adverse.test.mjs',
  'utf8'
);
const extended =
  base +
  `
for (const field of ['failed','skipped']) test('unknown '+field+' count alone blocks',()=>assert.equal(evaluate([{...good('auth'),tests:{total:2,passed:2,failed:0,skipped:0,[field]:null}},good('billing')]).decision,'blocked'));
test('newer valid recovery can pass after earlier failure',()=>assert.equal(evaluate([{...good('auth'),conclusion:'failure',tests:{total:2,passed:1,failed:1,skipped:0}},good('billing'),{...good('auth'),runId:'125',completedAt:'2026-10-26T11:45:00.000Z'}]).decision,'pass'));
test('equal-time contradictory records cannot be ordered into success',()=>assert.equal(evaluate([good('auth'),good('billing'),{...good('auth'),conclusion:'failure',tests:{total:2,passed:1,failed:1,skipped:0}}]).decision,'blocked'));
test('unknown failed execution timestamp cannot be ignored',()=>assert.equal(evaluate([good('auth'),good('billing'),{...good('auth'),completedAt:'invalid',conclusion:'failure',tests:{total:2,passed:1,failed:1,skipped:0}}]).decision,'blocked'));
`;
const variants = {
  control: source,
  failed_count: source.replace(
    'if (t.failed !== 0)',
    'if (t.failed > 0 || t.failed === undefined)'
  ),
  skipped_count: source.replace(
    'if (t.skipped !== 0)',
    'if (t.skipped > 0 || t.skipped === undefined)'
  ),
  oldest_wins: source.replace(
    'Math.max(...executions.map',
    'Math.min(...executions.map'
  ),
  missing_range: source.replace(
    /export function journeysRequired\(range\) \{[\s\S]*?\n\}/,
    `export function journeysRequired(range) {if (!range || range.schema !== 'jovie.release-range-risk/v1') return true;if (range.unknown === true) return true;const a=range.affects??{};return a.auth===true||a.billing===true||a.unknown===true;}`
  ),
};
const results = [];
for (const [id, text] of Object.entries(variants)) {
  if (id !== 'control' && text === source)
    throw Error('Mutation did not apply: ' + id);
  const modulePath = `${dir}/${id}.mjs`,
    testPath = `${dir}/${id}.test.mjs`;
  writeFileSync(modulePath, text);
  writeFileSync(testPath, extended.replace(sourcePath, modulePath));
  const run = spawnSync(process.execPath, [testPath], { encoding: 'utf8' });
  writeFileSync(`${dir}/${id}.log`, (run.stdout ?? '') + (run.stderr ?? ''));
  const counts = {};
  for (const key of ['tests', 'pass', 'fail', 'skipped'])
    counts[key] = Number(
      (run.stdout ?? '').match(
        new RegExp('(?:ℹ |# )' + key + ' (\\d+)')
      )?.[1] ?? -1
    );
  results.push({
    id,
    exitCode: run.status,
    error: run.error?.code ?? null,
    counts,
    sha256: createHash('sha256').update(text).digest('hex'),
    status: run.error
      ? 'ERROR'
      : id === 'control'
        ? run.status === 0
          ? 'PASS'
          : 'FAIL'
        : run.status === 1
          ? 'KILLED'
          : 'SURVIVED',
  });
}
writeFileSync(
  `${dir}/results.json`,
  JSON.stringify(
    {
      schema: 'jovie.targeted-mutation-review/v1',
      sourcePath,
      node: process.version,
      scope: 'local gate policy',
      results,
    },
    null,
    2
  ) + '\n'
);
console.log(JSON.stringify(results, null, 2));
process.exitCode = results.every(
  x => x.status === 'PASS' || x.status === 'KILLED'
)
  ? 0
  : 1;
