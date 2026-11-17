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

  // JOV-12620: a not-certified verdict is its own receipt; only smoke, auth
  // and Lighthouse fail the run. A crash that records nothing still fails.
  const runCertify = code => {
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
    const stub = `node() { printf '%s' '${JSON.stringify(receipts)}' > "$RUNNER_TEMP/prod-cert-receipts.json"; return ${code}; }\n`;
    const result = spawnSync('bash', ['-e', '-c', stub + run], {
      encoding: 'utf8',
      env: { ...process.env, RUNNER_TEMP: temp, GITHUB_STEP_SUMMARY: summary },
    });
    return {
      status: result.status,
      out: result.stdout,
      summary: readFileSync(summary, 'utf8'),
    };
  };

  it('records a not-certified verdict as a warning and summary, not a red run', () => {
    const { status, out, summary } = runCertify(1);
    expect(status).toBe(0);
    expect(out).toContain('::warning title=Golden path not certified::');
    expect(summary).toContain('| landing | failed | pen.design-exists |');
    expect(summary).toContain(
      '| chat | blocked | pen.matches-production: no Pen comparison yet |'
    );
    expect(summary).not.toContain('checkout');
  });

  it('still fails when certification crashes without a verdict', () => {
    expect(runCertify(2).status).toBe(2);
    expect(runCertify(0).status).toBe(0);
  });
});
