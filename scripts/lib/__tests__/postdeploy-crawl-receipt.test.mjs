import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { load } from 'js-yaml';
import { expect, it } from 'vitest';
import {
  scriptContractNodeArgs,
  selectSourceGuards,
} from '../../ci-fast-lanes.mjs';
import { createGitHubTransport } from '../../postdeploy-probe-admission.mjs';
import { productReady } from '../../product-crawl/ready-gate.mjs';
import { storedZip } from '../real-gh-harness.mjs';
import { selectScriptContracts } from '../script-contract-affected.mjs';

/** @typedef {{ name?: string, id?: string, if?: string, run?: string, uses?: string, env?: Record<string, string>, with?: { path?: string, name?: string, pattern?: string } }} WorkflowStep */
/** @typedef {{ if?: string, needs?: string[], env?: Record<string, string>, strategy?: { 'fail-fast'?: boolean, matrix?: Record<string, unknown> }, steps: WorkflowStep[] }} WorkflowJob */
/** @typedef {{ event: string, ref: string, resolveResult?: string, shouldCertify?: string }} CrawlEvent */

const REPO_ROOT = resolve(import.meta.dirname, '../../..');

const workflow =
  /** @type {{ on: Record<string, unknown>, jobs: Record<string, WorkflowJob> }} */ (
    load(
      readFileSync(
        resolve(
          import.meta.dirname,
          '../../../.github/workflows/postdeploy-probes.yml'
        ),
        'utf8'
      )
    )
  );

const standalone =
  /** @type {{ on: Record<string, unknown>, jobs: Record<string, WorkflowJob> }} */ (
    load(
      readFileSync(
        resolve(REPO_ROOT, '.github/workflows/product-crawl.yml'),
        'utf8'
      )
    )
  );

/** Evaluate only the production/fixture admission expressions used here.
 * @param {string | undefined} expression
 * @param {CrawlEvent} event
 */
function admitted(expression, event) {
  if (!expression) return true;
  return expression
    .replace(/^\$\{\{\s*(.*?)\s*\}\}$/u, '$1')
    .split(' && ')
    .every(part => {
      switch (part) {
        case 'always()':
          return true;
        case "github.event_name == 'workflow_dispatch'":
          return event.event === 'workflow_dispatch';
        case "github.ref == 'refs/heads/main'":
          return event.ref === 'refs/heads/main';
        case "needs.resolve-target.result == 'success'":
          return (event.resolveResult ?? 'success') === 'success';
        case "needs.resolve-target.outputs.should_certify == 'true'":
          return (event.shouldCertify ?? 'true') === 'true';
        default:
          throw new Error(`Unknown crawl admission expression: ${part}`);
      }
    });
}

it.each([
  { name: 'source PR', event: 'pull_request', ref: 'refs/pull/1/merge' },
  {
    name: 'golden-path clock',
    event: 'repository_dispatch',
    ref: 'refs/heads/main',
  },
  { name: 'failed controller', event: 'workflow_run', ref: 'refs/heads/main' },
  {
    name: 'cancelled controller',
    event: 'workflow_run',
    ref: 'refs/heads/main',
  },
  {
    name: 'superseded controller',
    event: 'workflow_run',
    ref: 'refs/heads/main',
  },
  {
    name: 'successful controller',
    event: 'workflow_run',
    ref: 'refs/heads/main',
  },
  {
    name: 'repeated successful controller',
    event: 'workflow_run',
    ref: 'refs/heads/main',
  },
  {
    name: 'manual branch',
    event: 'workflow_dispatch',
    ref: 'refs/heads/feature',
  },
  { name: 'manual tag', event: 'workflow_dispatch', ref: 'refs/tags/v1' },
])('starts no production crawl for $name', event => {
  // A denied job never starts its crawler. Required health/auth jobs retain
  // their independent policies; this assertion concerns full crawls only.
  const starts = [
    { trigger: standalone.on, job: standalone.jobs.crawl },
    { trigger: workflow.on, job: workflow.jobs['product-crawl'] },
  ].filter(
    ({ trigger, job }) =>
      Object.hasOwn(trigger, event.event) && admitted(job.if, event)
  );
  expect(starts).toHaveLength(0);
});

it('retains manual-main admission and the original landed-target prerequisites', () => {
  const manual = { event: 'workflow_dispatch', ref: 'refs/heads/main' };
  expect(admitted(standalone.jobs.crawl.if, manual)).toBe(true);
  const crawl = workflow.jobs['product-crawl'];
  expect(admitted(crawl.if, manual)).toBe(true);
  expect(crawl.needs).toEqual(['resolve-target', 'auth-smoke']);
  for (const resolveResult of ['failure', 'cancelled', 'skipped'])
    expect(admitted(crawl.if, { ...manual, resolveResult })).toBe(false);
  for (const shouldCertify of ['false', ''])
    expect(admitted(crawl.if, { ...manual, shouldCertify })).toBe(false);
  expect(() => admitted('unknown()', manual)).toThrow(
    'Unknown crawl admission'
  );
});

it('reuses existing source-CI fixture qualification without publishing production evidence', () => {
  expect(Object.keys(standalone.on)).toEqual(['workflow_dispatch']);
  expect(Object.keys(standalone.jobs)).toEqual(['crawl']);
  const fixtures = [
    'scripts/product-crawl/closed-in-production.test.mjs',
    'scripts/product-crawl/ready-gate.test.mjs',
    'scripts/product-crawl/sample-params.test.mjs',
    'scripts/product-crawl/throttle.test.mjs',
  ];
  for (const changed of [
    'scripts/product-crawl/crawl.mjs',
    'scripts/product-crawl/observe.mjs',
    '.github/workflows/product-crawl.yml',
  ]) {
    expect(
      selectSourceGuards('pull_request', [changed]).some(
        guard => guard.id === 'script-contracts'
      )
    ).toBe(true);
    const selected = selectScriptContracts([changed]);
    expect(selected.full).toBe(true);
    expect(selected.node).toEqual(expect.arrayContaining(fixtures));
  }
  const batches = scriptContractNodeArgs(fixtures);
  expect(batches).toEqual([['--test', ...fixtures]]);
  const result = spawnSync(process.execPath, batches[0], {
    cwd: REPO_ROOT,
    encoding: 'utf8',
  });
  expect(result.status, result.stdout + result.stderr).toBe(0);
  expect(result.stdout).toMatch(/(?:pass|passed)\s+[1-9]\d*/u);
  // Fixture success cannot fill a missing or incomplete live crawl receipt.
  expect(productReady(null, { now: 0 }).ready).toBe(false);
  expect(
    productReady(
      {
        origin: 'https://fixture.invalid',
        pages: [],
        routes: [],
        at: '2026-11-13T00:00:00Z',
      },
      { now: Date.parse('2026-11-13T00:00:00Z') }
    ).ready
  ).toBe(false);
});

it('reports skipped automatic crawls as unmeasured without forging a receipt', () => {
  const step = workflow.jobs['resolve-target'].steps.find(
    candidate => candidate.name === 'Record full-crawl containment'
  );
  expect(step?.run).toBeTypeOf('string');
  expect(step?.if).toBe(
    "${{ always() && (github.event_name != 'workflow_dispatch' || github.ref != 'refs/heads/main') }}"
  );
  expect(step?.run).not.toMatch(
    /receipt\.json|verdict\.json|product-crawl\/v1/u
  );
  const root = mkdtempSync(join(tmpdir(), 'crawl-containment-'));
  try {
    const summary = join(root, 'summary');
    const result = spawnSync('bash', ['-e', '-o', 'pipefail', '-c', step.run], {
      cwd: root,
      encoding: 'utf8',
      env: { ...process.env, GITHUB_STEP_SUMMARY: summary },
    });
    expect(result.status, result.stderr).toBe(0);
    expect(readFileSync(summary, 'utf8')).toContain(
      'no production readiness score produced'
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

it('writes the crawl receipt under the artifact guard it uploads from', () => {
  // This job uploads only from the guard's producer stage. Run outside the
  // guard, the receipt never reached the stage and the upload was refused as
  // PLAYWRIGHT_ARTIFACT_SECRET_EXPOSURE inspection-error (run 42454821107).
  const job = workflow.jobs['product-crawl'];
  expect(job.env?.PLAYWRIGHT_ARTIFACT_REQUIRE_PRODUCER_STAGE).toBe('true');
  const crawl = job.steps.find(step =>
    step.run?.includes('scripts/product-crawl/crawl.mjs --origin')
  );
  const guarded = crawl?.run?.match(
    /PLAYWRIGHT_ARTIFACT_PATHS='([^']+)' \\\s+node \.github\/scripts\/guard-playwright-artifacts\.mjs --run -- \\\s+node scripts\/product-crawl\/crawl\.mjs/
  );
  expect(guarded?.[1]).toBe('product-crawl-receipt/*.json');
  const upload = job.steps.find(
    step => step.uses === './.github/actions/upload-safe-playwright-artifact'
  );
  expect(upload?.with?.path).toBe(guarded?.[1]);
});

it('judges the sharded crawl once, from every shard, under the same admission', () => {
  // JOV-12635: four shards each write their own receipt; the merge job
  // combines them and uploads the one receipt under the original name.
  const crawl = workflow.jobs['product-crawl'];
  const merge = workflow.jobs['product-crawl-merge'];
  expect(crawl.strategy?.matrix?.shard).toEqual([1, 2, 3, 4]);
  expect(crawl.strategy?.['fail-fast']).toBe(false);
  expect(merge.needs).toEqual(['resolve-target', 'product-crawl']);
  expect(merge.if).toBe(crawl.if);
  expect(merge.env?.PLAYWRIGHT_ARTIFACT_REQUIRE_PRODUCER_STAGE).toBe('true');
  const step = merge.steps.find(s =>
    s.run?.includes('node scripts/product-crawl/merge-receipts.mjs')
  );
  const guarded = step?.run?.match(
    /PLAYWRIGHT_ARTIFACT_PATHS='([^']+)' \\\s+node \.github\/scripts\/guard-playwright-artifacts\.mjs --run -- \\\s+node scripts\/product-crawl\/merge-receipts\.mjs/
  );
  expect(guarded?.[1]).toBe('product-crawl-receipt/*.json');
  const download = merge.steps.find(s =>
    s.uses?.startsWith('actions/download-artifact@')
  );
  const shardUpload = crawl.steps.find(
    s => s.uses === './.github/actions/upload-safe-playwright-artifact'
  );
  expect(download?.with?.pattern).toBe(
    'product-crawl-shard-*-${{ github.run_id }}'
  );
  expect(shardUpload?.with?.name).toBe(
    'product-crawl-shard-${{ matrix.shard }}-${{ github.run_id }}'
  );
  const upload = merge.steps.find(
    s => s.uses === './.github/actions/upload-safe-playwright-artifact'
  );
  expect(upload?.with?.name).toBe('product-crawl-receipt-${{ github.run_id }}');
  expect(upload?.with?.path).toBe(guarded?.[1]);
  const run = crawl.steps.find(s => s.run?.includes('crawl.mjs --origin'));
  expect(run?.env?.CRAWL_SHARD).toBe('${{ matrix.shard }}/4');
});

it('sets both existing crawl deadlines before setup while preserving manual-only admission', () => {
  const jobs = [standalone.jobs.crawl, workflow.jobs['product-crawl']];
  for (const [index, job] of jobs.entries()) {
    const deadline = job.steps.find(
      step => step.name === 'Establish crawl deadline'
    );
    expect(deadline?.run).toBeTypeOf('string');
    if (!deadline?.run) throw new Error('missing crawl deadline');
    expect(job.steps.indexOf(deadline)).toBe(1);
    const root = mkdtempSync(join(tmpdir(), 'crawl-deadline-'));
    try {
      const envFile = join(root, 'environment');
      const result = spawnSync(
        'bash',
        [
          '-e',
          '-o',
          'pipefail',
          '-c',
          `date() { printf '%s\\n' 1000; }\n${deadline.run}`,
        ],
        {
          cwd: root,
          encoding: 'utf8',
          env: { ...process.env, GITHUB_ENV: envFile },
        }
      );
      expect(result.status, result.stderr).toBe(0);
      const minutes = index === 0 ? 30 : 40;
      expect(readFileSync(envFile, 'utf8')).toBe(
        `CRAWL_DEADLINE_EPOCH_MS=${(1000 + minutes * 60 - 240) * 1000}\n`
      );
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  }
});

it('reads only hash-verified canonical crawl members through the existing bounded transport', () => {
  const root = mkdtempSync(join(tmpdir(), 'crawl-reuse-transport-'));
  try {
    const archive = storedZip({
      'receipt.json': JSON.stringify({ schema: 'fixture', value: 1 }),
      'verdict.json': '{}',
    });
    const digest = `sha256:${createHash('sha256').update(archive).digest('hex')}`;
    const execute = (command, args, options) => {
      if (command === process.execPath) {
        const fd = options.stdio[1];
        if (typeof fd !== 'number')
          throw new Error('expected private artifact descriptor');
        writeFileSync(fd, archive);
        return { status: 0 };
      }
      return spawnSync(command, args, options);
    };
    const transport = createGitHubTransport({ execute, temporaryRoot: root });
    expect(transport.getCrawlReceipt('JovieInc/Jovie', 1, digest)).toEqual({
      schema: 'fixture',
      value: 1,
    });
    expect(() =>
      transport.getCrawlReceipt('JovieInc/Jovie', 1, `sha256:${'0'.repeat(64)}`)
    ).toThrow('digest mismatch');
    expect(() => transport.getLedger('JovieInc/Jovie', 1)).toThrow(
      'only ledger.json'
    );
    const unsafe = storedZip({
      'receipt.json': '{}',
      'verdict.json': '{}',
      '../private-state.json': 'private',
    });
    const unsafeDigest = `sha256:${createHash('sha256').update(unsafe).digest('hex')}`;
    const bad = createGitHubTransport({
      temporaryRoot: root,
      execute: (command, args, options) => {
        if (command === process.execPath) {
          const fd = options.stdio[1];
          if (typeof fd !== 'number')
            throw new Error('expected private artifact descriptor');
          writeFileSync(fd, unsafe);
          return { status: 0 };
        }
        return spawnSync(command, args, options);
      },
    });
    expect(() =>
      bad.getCrawlReceipt('JovieInc/Jovie', 1, unsafeDigest)
    ).toThrow('canonical crawl');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

it('uses only existing manual-main resolve authority and bounded nonsecret outputs for public adoption', () => {
  const lookup = workflow.jobs['resolve-target'].steps.find(
    s => s.id === 'crawl-public-reuse'
  );
  expect(lookup.if).toContain("github.event_name == 'workflow_dispatch'");
  expect(lookup.if).toContain("github.ref == 'refs/heads/main'");
  expect(lookup.run).toContain('scripts/product-crawl/receipt-adoption.mjs');
  const job = workflow.jobs['product-crawl'];
  const caller = job.steps.find(
    s => s.name === 'Crawl as a stranger and signed in'
  );
  expect(caller.env.CRAWL_PUBLIC_REUSE_B64).toBe(
    '${{ needs.resolve-target.outputs.crawl_public_reuse_b64 }}'
  );
  expect(caller.run).toContain('guard-playwright-artifacts.mjs --run --');
  expect(caller.run).toContain('scripts/product-crawl/crawl.mjs');
});
