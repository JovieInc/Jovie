import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { load } from 'js-yaml';
import { describe, expect, it } from 'vitest';

/** @typedef {{ name?: string, if?: string, run?: string }} Step */
const workflow = /** @type {{ jobs: Record<string, { steps?: Step[] }> }} */ (
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

describe('golden path certification after the Pen export', () => {
  it('still certifies when the Pen tooling fails before writing a receipt', () => {
    const steps = Object.values(workflow.jobs).flatMap(job => job.steps ?? []);
    const certify = steps.find(
      s => s.name === 'Certify the golden path on production'
    );
    // A skipped step posts no verdict; a missing receipt fails the Pen frames.
    expect(certify?.if).toBe('${{ !cancelled() }}');
  });

  // A not-certified verdict (rc=1) must fail the job (never swallow rc=1 into
  // exit 0 as a false-green workflow run) while still uploading receipts via
  // `if: ${{ always() }}`.
  const runCertify = (code, writeReceipts = true, env = {}) => {
    const steps = Object.values(workflow.jobs).flatMap(job => job.steps ?? []);
    const run = steps.find(
      s => s.name === 'Certify the golden path on production'
    )?.run;
    const temp = mkdtempSync(join(tmpdir(), 'prod-cert-verdict-'));
    const summary = join(temp, 'summary.md');
    writeFileSync(summary, '');
    const receipts = {
      receipts: [
        {
          surface: 'landing',
          status: 'failed',
          checks: [{ id: 'pen.design-exists', status: 'failed' }],
        },
        {
          surface: 'chat',
          status: 'blocked',
          blocker: 'pen.matches-production: no Pen comparison yet',
          checks: [],
        },
        { surface: 'checkout', status: 'passed', checks: [] },
      ],
    };
    const stub = writeReceipts
      ? `node() { printf '%s' '${JSON.stringify(receipts)}' > "$RUNNER_TEMP/prod-cert-receipts.json"; return ${code}; }\n`
      : `node() { return ${code}; }\n`;
    const result = spawnSync('bash', ['-e', '-c', stub + run], {
      encoding: 'utf8',
      env: {
        ...process.env,
        RUNNER_TEMP: temp,
        GITHUB_STEP_SUMMARY: summary,
        ...env,
      },
    });
    return {
      status: result.status,
      out: result.stdout,
      summary: readFileSync(summary, 'utf8'),
    };
  };

  it('fails the job (exit 1, never false-green exit 0) and writes the summary table when prod-cert is not certified', () => {
    const { status, out, summary } = runCertify(1);
    expect(status).toBe(1);
    expect(out).toContain('::error title=Golden path not certified::');
    expect(summary).toContain('| landing | failed | pen.design-exists |');
    expect(summary).toContain(
      '| chat | blocked | pen.matches-production: no Pen comparison yet |'
    );
    expect(summary).not.toContain('checkout');

    const certSteps = workflow.jobs['golden-path-cert']?.steps ?? [];
    const upload = certSteps.find(
      s => s.name === 'Upload certification receipts'
    );
    expect(upload?.if).toBe('${{ always() }}');
    // JOV-14402: no reuse stamp; the ledger itself records each step's pass.
    expect(certSteps.map(s => s.name ?? '').join('\n')).not.toMatch(/stamp/iu);
  });

  it('passes the decoded carry plan to prod-cert, and none without a plan', () => {
    const steps = Object.values(workflow.jobs).flatMap(job => job.steps ?? []);
    const run = steps.find(
      s => s.name === 'Certify the golden path on production'
    )?.run;
    const argsOf = env => {
      const temp = mkdtempSync(join(tmpdir(), 'prod-cert-carry-'));
      const stub = `node() { printf '%s\\n' "$@" > "$RUNNER_TEMP/args"; return 0; }\n`;
      const result = spawnSync('bash', ['-e', '-c', stub + run], {
        encoding: 'utf8',
        env: { ...process.env, RUNNER_TEMP: temp, ...env },
      });
      expect(result.status).toBe(0);
      return {
        args: readFileSync(join(temp, 'args'), 'utf8').trim().split('\n'),
        temp,
      };
    };
    const plan = '{"schema":"jovie.golden-path-carry/v1"}';
    const carried = argsOf({
      CERT_PLAN_B64: Buffer.from(plan).toString('base64'),
    });
    const at = carried.args.indexOf('--carry');
    expect(at).toBeGreaterThan(0);
    expect(readFileSync(carried.args[at + 1], 'utf8')).toBe(plan);
    expect(argsOf({ CERT_PLAN_B64: '' }).args).not.toContain('--carry');
  });

  it('fails closed on rc=1 even when no receipt file was written and on rc=2 crashes', () => {
    expect(runCertify(1, false).status).toBe(1);
    expect(runCertify(2).status).toBe(2);
    expect(runCertify(0).status).toBe(0);
  });
});
