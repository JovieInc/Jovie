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

## Story evidence: keeping it fast

Story evidence (the `visual` and `a11y` criteria) used to bind every receipt to
one digest over all render inputs, so any merge to main staled every receipt
and the next run recaptured everything. Receipts now bind to each component's
own render closure (`jovie.component-render-inputs/v2`,
`scripts/lib/component-render-closure.mjs`): the component file, its story
files, everything they import, Storybook alias mocks, and a small shared set
(the Storybook preview and its imports, global CSS, configs, package manifests
and the lockfile). An import the graph cannot resolve, or a dynamic import,
falls back to the old global digest for that component only, so it fails
closed.

`visual-a11y.yml` runs it in three steps. **Plan** restores the last evidence,
builds a static story index, keeps every receipt whose source and closure are
unchanged, and sizes up to 20 capture shards for the rest at about 400 renders
each. **Capture** runs those shards in parallel. **Merge** joins the shards
with the reused receipts, saves the cache the certificate restores, and
reports the run against its budget: a cold run within 15 minutes, an
incremental one within 6. Over budget warns; it never fails.

Measured on main at `5bf11983` (Nov 14): 1,376 components, 1,279 with stories,
9,472 renders. Binding takes about 1.5 s and planning 3 s. Over the last 60
main commits, 27 touched render inputs: v1 recaptured all 1,376 components on
each, v2 about 205 on average. Keep it that way:

- Keep the shared set small. Files the preview imports reach every receipt, so
  import from a module's own file (`@jovie/ui/atoms/button`), never a barrel,
  in anything `.storybook/preview.tsx` reaches.
- Ship certification fixes as batch PRs by area (one PR for dozens of
  components), never one PR per component. Each merge then costs one
  incremental run, not one per component.
- Watch the plan line in the run summary. If `reused` stays low after a quiet
  merge, a file has crept into the shared set. `stats.shared` from
  `componentRenderBindings` gives its size (81 files at `5bf11983`), and
  `buildRenderGraph(root).closure(['apps/web/.storybook/preview.tsx']).files`
  lists what the preview reaches.
