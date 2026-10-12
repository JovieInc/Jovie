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
});
