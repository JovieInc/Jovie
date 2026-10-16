import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const testDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(testDir, '..', '..', '..', '..', '..');

function getJobBlock(workflow: string, jobName: string): string {
  const lines = workflow.split('\n');
  const start = lines.findIndex(line => line === `  ${jobName}:`);

  expect(start, `Missing workflow job: ${jobName}`).toBeGreaterThanOrEqual(0);

  const block: string[] = [];
  for (let index = start; index < lines.length; index++) {
    const line = lines[index]!;
    if (index > start && /^  \S/.test(line)) break;
    block.push(line);
  }

  return block.join('\n');
}

describe('nightly workflow residuals (JOV-8095)', () => {
  it('installs Playwright browsers in the deterministic telemetry job', () => {
    const workflow = readFileSync(
      resolve(repoRoot, '.github/workflows/nightly-testing-agent.yml'),
      'utf8'
    );
    const deterministic = getJobBlock(workflow, 'deterministic');

    // playwright-artifact-secrets.test.ts launches Chromium (JOV-5101); the
    // job fails every nightly without a browser install.
    expect(deterministic).toContain('uses: ./.github/actions/setup-playwright');
    expect(
      deterministic.indexOf('uses: ./.github/actions/setup-playwright')
    ).toBeLessThan(deterministic.indexOf('- name: Run unit suite'));
  });

  it('gives the full unit suite timeout headroom above the measured 60m ceiling', () => {
    const workflow = readFileSync(
      resolve(repoRoot, '.github/workflows/nightly-tests.yml'),
      'utf8'
    );
    const unit = getJobBlock(workflow, 'unit-tests');
    const timeout = Number(unit.match(/^\s+timeout-minutes:\s+(\d+)$/m)?.[1]);

    // The Oct 8 17:19Z run was cancelled AT the 60m cap after the suite grew
    // ~11.5m; keep headroom over the measured 49.7m step duration.
    expect(timeout).toBeGreaterThanOrEqual(75);
  });

  it('arms the onboarding Turnstile gate on the nightly QA server (JOV-8500)', () => {
    const workflow = readFileSync(
      resolve(repoRoot, '.github/workflows/nightly-tests.yml'),
      'utf8'
    );
    const e2e = getJobBlock(workflow, 'e2e-tests');
    const start = e2e.indexOf('- name: Start route QA bypass server');
    const next = e2e.indexOf('- name: Run nightly route QA breadth pass');
    const serverStep = e2e.slice(start, next);

    // The probe hits the already-running standalone server, so the gate
    // env belongs on this step.
    expect(start).toBeGreaterThanOrEqual(0);
    expect(next).toBeGreaterThan(start);
    expect(serverStep).toContain('node .next/standalone/apps/web/server.js');
    expect(serverStep).toContain("E2E_REQUIRE_TURNSTILE_GATE: '1'");
    expect(serverStep).toContain(
      'NEXT_PUBLIC_TURNSTILE_SITE_KEY: 1x00000000000000000000AA'
    );
    expect(serverStep).toContain(
      'TURNSTILE_SECRET_KEY: 1x0000000000000000000000000000000AA'
    );
    expect(serverStep).toContain(
      'SESSION_SECRET: nightly-qa-onboarding-session-secret-0123456789abcdef'
    );
  });
});
