# Component certification performance

The certificate keeps every criterion and evidence binding. It parses a component
once for ownership, token and frontend checks, removes the unused state-analysis
parse, and discovers overlapping recursive roots once. The `packages/ui`
top-level scope and canonical certificate order are preserved.

Against baseline `f49eba8f9d`, a frozen snapshot contained 1,371 components and 11
criteria. Five alternating subprocess measurements after one warmup each reduced
median whole-tree reporting from **4,614.61 ms to 3,019.66 ms**: **34.56% less time**
and **1.53× throughput**. Every full report matched, excluding `generatedAt`.

These are local shared-cloud timings, with other agents and dependency setup
active; they are not hosted-CI, browser, mutation-runner or model-latency evidence.
The snapshot freezes source, tests, stories, policy and recorded benchmark inputs
so parallel edits cannot masquerade as a speedup or semantic change.

**Ship now:** reuse syntax trees and inventory walks. **Re-evaluate when:** rendered
capture, mutation or model calls dominate measured end-to-end certification.
**Then:** optimize that stage using its receipts, retaining fail-closed checks.

Run from the repo root with its pinned Node and installed dependencies. The
following creates temporary baseline modules and frozen input files, checks full
report parity, and prints raw timings and medians. It adds no timing assertion to CI.

```bash
node --input-type=module <<'JS'
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { cpSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { performance } from 'node:perf_hooks';
import { pathToFileURL } from 'node:url';

const repo = process.cwd();
const temp = mkdtempSync(join(tmpdir(), 'component-cert-benchmark-'));
const snapshot = join(temp, 'snapshot');
const revision = 'f49eba8f9d';
for (const path of ['packages/ui', 'apps/web/components', 'docs/design-system']) {
  mkdirSync(dirname(join(snapshot, path)), { recursive: true });
  cpSync(join(repo, path), join(snapshot, path), { recursive: true });
}
const baselineLib = join(temp, 'baseline-lib.mjs');
const baselineCli = join(temp, 'baseline-cli.mjs');
for (const [path, output] of [
  ['scripts/lib/component-certificate.mjs', baselineLib],
  ['scripts/component-certificate.mjs', baselineCli],
]) {
  const source = execFileSync('git', ['show', `${revision}:${path}`], { encoding: 'utf8' });
  const base = pathToFileURL(join(repo, path));
  writeFileSync(output, source.replace(/from '([^']+)'/g, (all, spec) => {
    if (spec === 'typescript') return `from '${import.meta.resolve('typescript')}'`;
    if (!spec.startsWith('.')) return all;
    const url = output === baselineCli && spec === './lib/component-certificate.mjs'
      ? pathToFileURL(baselineLib) : new URL(spec, base);
    return `from '${url.href}'`;
  }));
}
const samples = { before: [], after: [] };
let reference;
for (let iteration = 0; iteration < 6; iteration++) {
  for (const [variant, cli] of [
    ['before', baselineCli], ['after', join(repo, 'scripts/component-certificate.mjs')],
  ]) {
    const output = join(temp, `${variant}.json`);
    const start = performance.now();
    execFileSync(process.execPath, [cli, '--repo-root', snapshot, '--all', '--out', output]);
    const elapsed = performance.now() - start;
    const { generatedAt, ...report } = JSON.parse(readFileSync(output, 'utf8'));
    reference ??= report;
    assert.deepEqual(report, reference);
    if (iteration > 0) samples[variant].push(elapsed);
  }
}
const median = xs => [...xs].sort((a, b) => a - b)[2];
console.log(JSON.stringify({ revision, components: reference.totals.components,
  identicalReports: true, samples,
  medianMs: Object.fromEntries(Object.entries(samples).map(([key, xs]) => [key, median(xs)])),
}, null, 2));
console.log(`Temporary evidence: ${temp}`);
JS
```
