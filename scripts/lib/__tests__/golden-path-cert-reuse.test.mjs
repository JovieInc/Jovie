import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { load } from 'js-yaml';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { main, planLines } from '../../golden-path-cert-reuse.mjs';
import * as reuse from '../golden-path-cert-reuse.mjs';
import {
  allCurrent,
  CARRY_SCHEMA,
  CERTIFIED_SCHEMA,
  decideCarry,
  exercisedPass,
  parseCarryPlan,
  producerFiles,
  readLedgerCertifications,
  WORKFLOW_PATH,
} from '../golden-path-cert-reuse.mjs';
import { SURFACE_IDS } from '../prod-cert.mjs';

const ROOT = resolve(import.meta.dirname, '../../..');
const served = 'a'.repeat(40);
const older = 'b'.repeat(40);
const oldest = 'c'.repeat(40);
const nowMs = Date.parse('2026-11-22T12:00:00.000Z');
const pass = (sha, extra = {}) => ({
  sha,
  endedAt: '2026-11-01T00:00:00.000Z',
  runUrl: `https://github.com/jovieinc/jovie/actions/runs/${sha.slice(0, 3)}`,
  ...extra,
});
/** Ledger certifications with every step's last pass on `sha`. */
const ledgerOn = (sha, overrides = {}) => ({
  servedSha: sha,
  surfaces: Object.fromEntries(
    SURFACE_IDS.map(id => [
      id,
      { lastPassed: id in overrides ? overrides[id] : pass(sha) },
    ])
  ),
});
const untouched = () => ({ all: false, steps: [] });
const decide = (ledger, extra = {}) =>
  decideCarry({
    servedSha: served,
    ledger,
    touched: untouched,
    nowMs,
    ...extra,
  });

describe('decideCarry (JOV-14402)', () => {
  it('runs nothing when every step already passed on the served SHA', () => {
    const plan = decide(ledgerOn(served));
    expect(plan.current).toEqual([...SURFACE_IDS]);
    expect(plan.carried).toEqual([]);
    expect(plan.recertify).toEqual([]);
    expect(allCurrent(plan)).toBe(true);
  });

  it('has no clock: a pass from long ago still counts on its own SHA', () => {
    const ancient = ledgerOn(served);
    for (const id of SURFACE_IDS)
      ancient.surfaces[id].lastPassed.endedAt = '2025-01-01T00:00:00.000Z';
    expect(allCurrent(decide(ancient))).toBe(true);
  });

  it('carries untouched steps and re-certifies only the touched ones', () => {
    const plan = decide(ledgerOn(older), {
      touched: () => ({
        all: false,
        steps: ['chat'],
        why: { chat: 'apps/web/app/api/chat/route.ts' },
      }),
    });
    expect(plan.recertify).toEqual([
      { surface: 'chat', why: 'apps/web/app/api/chat/route.ts' },
    ]);
    expect(plan.carried.map(c => c.surface)).toEqual(
      SURFACE_IDS.filter(id => id !== 'chat')
    );
    expect(plan.carried[0].from).toEqual(pass(older));
    expect(allCurrent(plan)).toBe(false);
  });

  it('re-certifies every step when the change touches all of them', () => {
    const plan = decide(ledgerOn(older), {
      touched: () => ({ all: true, steps: [], reason: 'pnpm-lock.yaml' }),
    });
    expect(plan.carried).toEqual([]);
    expect(plan.recertify.map(r => r.why)).toEqual(
      SURFACE_IDS.map(() => 'pnpm-lock.yaml')
    );
  });

  it('diffs a carried pass from the run that actually exercised the step', () => {
    const seen = [];
    const ledger = ledgerOn(older, {
      chat: pass(older, { carriedFrom: pass(oldest) }),
    });
    const plan = decide(ledger, {
      touched: from => {
        seen.push(from);
        return untouched();
      },
    });
    expect(seen.sort()).toEqual([older, oldest]);
    expect(plan.carried.find(c => c.surface === 'chat').from).toEqual(
      pass(oldest)
    );
    expect(exercisedPass(pass(older))).toEqual(pass(older));
  });

  it('computes each from-SHA diff once', () => {
    const touched = vi.fn(untouched);
    decide(ledgerOn(older), { touched });
    expect(touched).toHaveBeenCalledTimes(1);
  });

  it('fails toward certifying', () => {
    const everyStep = plan =>
      expect(plan.recertify.map(r => r.surface)).toEqual([...SURFACE_IDS]);
    everyStep(decide(null));
    everyStep(decide(ledgerOn(served), { force: true }));
    everyStep(decide(ledgerOn(older), { servedSha: 'not-a-sha' }));
    const broken = decide(ledgerOn(older), {
      touched: () => {
        throw new Error('bad object');
      },
    });
    everyStep(broken);
    expect(broken.recertify[0].why).toContain('bad object');
  });

  it('re-certifies a step with no pass (never passed, or failed since)', () => {
    const plan = decide(ledgerOn(served, { checkout: null }));
    expect(plan.recertify).toEqual([
      {
        surface: 'checkout',
        why: 'no pass to carry (never passed, or failed since)',
      },
    ]);
  });
});

describe('readLedgerCertifications', () => {
  const body = (surfaces, extra = {}) => ({
    schema: CERTIFIED_SCHEMA,
    ledger: 'present',
    servedSha: served,
    surfaces,
    ...extra,
  });

  it('reads each step last pass from the ledger GET', () => {
    const read = readLedgerCertifications(
      body({
        chat: {
          certifiedSha: older,
          certified: false,
          lastPassed: pass(older, { carriedFrom: pass(oldest) }),
        },
      })
    );
    expect(read.servedSha).toBe(served);
    expect(read.surfaces.chat.lastPassed.carriedFrom).toEqual(pass(oldest));
    expect(read.surfaces.landing.lastPassed).toBeNull();
  });

  it('carries nothing from a GET that predates per-step certifications', () => {
    // The pre-JOV-14402 GET returned only certifiedSurfaces and maxAgeMs.
    expect(
      readLedgerCertifications({
        schema: CERTIFIED_SCHEMA,
        ledger: 'present',
        certifiedSurfaces: ['chat'],
        maxAgeMs: 86_400_000,
      })
    ).toBeNull();
    expect(
      readLedgerCertifications(body({}, { ledger: 'missing' }))
    ).toBeNull();
    expect(readLedgerCertifications(body({}, { schema: 'other' }))).toBeNull();
    expect(
      readLedgerCertifications(body({ chat: { lastPassed: { sha: 'x' } } }))
    ).toBeNull();
  });
});

describe('parseCarryPlan', () => {
  const plan = () => decide(ledgerOn(older));

  it('accepts a plan that names every step once', () => {
    expect(parseCarryPlan(plan())).toEqual(plan());
    expect(plan().schema).toBe(CARRY_SCHEMA);
  });

  it('refuses a plan that drops, repeats or mis-carries a step', () => {
    const dropped = plan();
    dropped.carried.pop();
    const repeated = plan();
    repeated.current.push(repeated.carried[0].surface);
    const selfCarry = plan();
    selfCarry.carried[0].from.sha = served;
    for (const bad of [dropped, repeated, selfCarry, null, { schema: 'x' }])
      expect(parseCarryPlan(bad)).toBeNull();
  });
});

describe('golden-path-cert-reuse decide CLI', () => {
  let dir;
  afterEach(() => dir && rmSync(dir, { recursive: true, force: true }));
  const writeLedger = (d, surfaces) => {
    const ledger = join(d, 'ledger.json');
    writeFileSync(
      ledger,
      JSON.stringify({
        schema: CERTIFIED_SCHEMA,
        ledger: 'present',
        servedSha: served,
        surfaces,
      })
    );
    return ledger;
  };
  const run = args => {
    dir = mkdtempSync(join(tmpdir(), 'gp-carry-'));
    const out = join(dir, 'github-output');
    writeFileSync(out, '');
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    const code = main(
      ['decide', '--served-sha', served, '--github-output', out, ...args(dir)],
      {}
    );
    log.mockRestore();
    expect(code).toBe(0);
    return Object.fromEntries(
      readFileSync(out, 'utf8')
        .trim()
        .split('\n')
        .map(line => line.split(/=(.*)/su).slice(0, 2))
    );
  };

  it('certifies every step when the ledger file is unreadable', () => {
    const outputs = run(d => ['--ledger', join(d, 'missing.json')]);
    expect(outputs.all_current).toBe('false');
    expect(outputs.recertify.split(' ')).toEqual([...SURFACE_IDS]);
    expect(outputs.carried).toBe('');
    const plan = JSON.parse(Buffer.from(outputs.plan_b64, 'base64').toString());
    expect(parseCarryPlan(plan)).not.toBeNull();
  });

  it('certifies every step when forced, even if all are current', () => {
    const outputs = run(d => [
      '--ledger',
      writeLedger(d, ledgerOn(served).surfaces),
      '--force',
      'true',
    ]);
    expect(outputs.recertify.split(' ')).toEqual([...SURFACE_IDS]);
  });

  it('reports nothing to run when every step is current', () => {
    let planOut = '';
    const outputs = run(d => {
      planOut = join(d, 'plan.json');
      return [
        '--ledger',
        writeLedger(d, ledgerOn(served).surfaces),
        '--plan-out',
        planOut,
      ];
    });
    expect(outputs.all_current).toBe('true');
    expect(outputs.recertify).toBe('');
    expect(allCurrent(JSON.parse(readFileSync(planOut, 'utf8')))).toBe(true);
  });

  it('prints one line per step', () => {
    const lines = planLines(decide(ledgerOn(older)));
    expect(lines[0]).toContain('0 to certify, 8 carried');
    expect(lines.slice(1)).toHaveLength(SURFACE_IDS.length);
  });
});

describe('certification producer', () => {
  it('includes both CLI entrypoints and the prod-cert closure', () => {
    expect(producerFiles(ROOT)).toEqual(
      expect.arrayContaining([
        'scripts/prod-cert.mjs',
        'scripts/golden-path-cert-reuse.mjs',
        'scripts/lib/golden-path-cert-reuse.mjs',
        'scripts/lib/golden-path-step-scope.mjs',
        'scripts/lib/prod-cert.mjs',
        'scripts/lib/prod-cert-carry.mjs',
        'scripts/lib/prod-cert-probes.mjs',
      ])
    );
  });

  it('has no age-based reuse left', () => {
    expect(reuse).not.toHaveProperty('REUSE_MAX_AGE_MS');
    expect(reuse).not.toHaveProperty('CERT_MAX_AGE_MS');
  });
});

describe('postdeploy-probes workflow wiring (JOV-14402)', () => {
  const workflow = /** @type {any} */ (
    load(readFileSync(resolve(ROOT, WORKFLOW_PATH), 'utf8'))
  );
  const jobs = workflow.jobs;
  const step = (job, id) => jobs[job].steps.find(s => s.id === id);
  const resolver = () => step('resolve-target', 'cert-carry');

  it('offers a force input that defaults to false', () => {
    expect(workflow.on.workflow_dispatch.inputs.force).toMatchObject({
      type: 'boolean',
      default: false,
    });
    expect(resolver().env.FORCE_RECERTIFY).toContain('client_payload.force');
  });

  it('decides the carry in the resolver and never fails it on an error', () => {
    const outputs = jobs['resolve-target'].outputs;
    expect(outputs.cert_all_current).toBe(
      "${{ steps.cert-carry.outputs.all_current == 'true' }}"
    );
    expect(outputs.cert_recertify).toBe(
      '${{ steps.cert-carry.outputs.recertify }}'
    );
    expect(outputs.cert_plan_b64).toBe(
      '${{ steps.cert-carry.outputs.plan_b64 }}'
    );
    expect(outputs).not.toHaveProperty('cert_reused');
    // A resolver failure pages production; a decision failure must not.
    expect(resolver().run).toMatch(
      /--github-output "\$GITHUB_OUTPUT" \|\|\n\s+echo "::warning::/u
    );
    expect(resolver().run).toContain('golden-path-cert-reuse.mjs decide');
    expect(resolver().run).toContain('/api/internal/ovie/golden-path-evidence');
  });

  it('fetches the release commits the diff needs, with full trees', () => {
    const run = resolver().run;
    expect(run).toContain('fetch --quiet --no-tags --depth=1');
    expect(run).not.toContain('--filter=blob:none');
    expect(run).toContain('.carriedFrom.sha? // .sha');
    expect(run).toContain('::add-mask::$git_basic_auth');
    expect(jobs['resolve-target'].steps[0].with['persist-credentials']).toBe(
      false
    );
  });

  it('skips certification only when every step is current', () => {
    expect(jobs['golden-path-cert'].if).toContain(
      "needs.resolve-target.outputs.cert_all_current != 'true'"
    );
    expect(jobs['auth-smoke'].if).toContain(
      "needs.resolve-target.outputs.should_probe == 'true' || (needs.resolve-target.outputs.cert_all_current != 'true'"
    );
    expect(jobs).not.toHaveProperty('golden-path-cert-reused');
    const names = jobs['golden-path-cert'].steps.map(s => s.name ?? '');
    expect(names.join('\n')).not.toMatch(/stamp|for reuse/iu);
  });

  it('passes the carry plan to prod-cert', () => {
    const certify = step('golden-path-cert', 'certify');
    expect(certify.env.CERT_PLAN_B64).toBe(
      '${{ needs.resolve-target.outputs.cert_plan_b64 }}'
    );
    expect(certify.run).toContain('carry_args=(--carry');
    expect(certify.run).toContain('"${carry_args[@]}"');
  });

  it('runs every Pen check whenever any step re-certifies', () => {
    for (const id of ['pen-source', 'pen-export'])
      expect(step('golden-path-cert', id).if).toBe(
        "${{ needs.resolve-target.outputs.cert_recertify != '' || needs.resolve-target.outputs.cert_plan_b64 == '' }}"
      );
  });

  it('restores the content-addressed Pen export cache read-only without dead cache saves on read-only tokens', () => {
    const steps = jobs['golden-path-cert'].steps;
    const restore = steps.find(s =>
      String(s.uses).endsWith('actions-cache/restore')
    );
    expect(restore.with.key).toBe('${{ steps.pen-source.outputs.cache_key }}');

    for (const [jobId, job] of Object.entries(jobs)) {
      const perms = Object.values(job.permissions ?? {});
      expect(
        perms.every(scope => scope === 'read'),
        `postdeploy-probes job ${jobId} must stay strictly read-only`
      ).toBe(true);
      for (const candidate of job.steps ?? []) {
        expect(
          String(candidate.uses ?? ''),
          `read-only job ${jobId} must not attempt cache/save (cache write denied without writable token scopes)`
        ).not.toMatch(/actions-cache\/save|actions\/cache\/save/);
      }
    }
  });
});
