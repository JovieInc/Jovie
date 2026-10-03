import { spawnSync } from 'node:child_process';
import {
  chmodSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { GATEWAY_ALLOWLIST_NAME } from '@/lib/constants/ai-models';

const testDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(testDir, '..', '..', '..', '..', '..');
const workflowPath = resolve(
  repoRoot,
  '.github/workflows/synthetic-monitoring.yml'
);
const agentTickWorkflowPath = resolve(
  repoRoot,
  '.github/workflows/agent-tick.yml'
);
const webAiHealthRunnerPath = resolve(
  repoRoot,
  '.github/scripts/run-web-ai-health.mjs'
);

function getStepBlock(workflow: string, stepName: string): string {
  const lines = workflow.split('\n');
  const start = lines.findIndex(line => line.trim() === `- name: ${stepName}`);

  expect(start, `Missing workflow step: ${stepName}`).toBeGreaterThanOrEqual(0);

  const block: string[] = [];

  for (let index = start; index < lines.length; index++) {
    const line = lines[index]!;

    if (index > start && line.startsWith('      - name: ')) break;
    if (index > start && /^[a-zA-Z0-9_-]+:/.test(line)) break;

    block.push(line);
  }

  return block.join('\n');
}

describe('synthetic monitoring workflow parser', () => {
  it.each([
    [workflowPath, 0],
    [workflowPath, 1],
    [agentTickWorkflowPath, 0],
    [agentTickWorkflowPath, 1],
  ])(
    'keeps canary exit and token isolation for %s with probe exit %i',
    (path, probeExit) => {
      const step = getStepBlock(
        readFileSync(path as string, 'utf8'),
        'Run Production Waitlist Canary'
      );
      const command = step
        .split('        run: |\n')[1]!
        .split('\n        continue-on-error:')[0]!
        .split('\n')
        .map(line => line.replace(/^ {10}/, ''))
        .join('\n');
      const directory = mkdtempSync(join(tmpdir(), 'jovie-waitlist-canary-'));
      try {
        const node = join(directory, 'node');
        writeFileSync(
          node,
          '#!/bin/sh\n[ -z "${DOPPLER_TOKEN:-}" ] || exit 91\nprintf "guard-command:%s\\n" "$*"\nexit 17\n'
        );
        chmodSync(node, 0o755);
        const result = spawnSync(
          'bash',
          [
            '-e',
            '-c',
            `
        doppler() {
          if [[ "\${@: -1}" == env ]]; then return "$FIXTURE_PROBE_EXIT"; fi
          while [[ "$1" != -- ]]; do shift; done
          shift
          "$@"
        }
        ${command}
      `,
          ],
          {
            encoding: 'utf8',
            env: {
              ...process.env,
              PATH: `${directory}:${process.env.PATH}`,
              DOPPLER_TOKEN: 'synthetic-canary-token',
              FIXTURE_PROBE_EXIT: String(probeExit),
            },
          }
        );
        expect(result.status, result.stderr).toBe(17);
        expect(result.stdout.match(/guard-command:/g)).toHaveLength(1);
        expect(result.stdout).toContain(
          'guard-playwright-artifacts.mjs --run -- pnpm'
        );
        expect(result.stdout).toContain(
          'tests/e2e/synthetic-production-waitlist.spec.ts'
        );
        expect(result.stdout).not.toContain('synthetic-canary-token');
      } finally {
        rmSync(directory, { recursive: true, force: true });
      }
    }
  );

  it('uses the shared parser module instead of inline skip-as-failure logic', () => {
    const workflow = readFileSync(workflowPath, 'utf8');
    const parseStep = getStepBlock(workflow, 'Parse test results');

    expect(parseStep).toContain(
      "require('./.github/scripts/parse-synthetic-test-results.js')"
    );
    expect(parseStep).toContain('parseSyntheticTestResults');
    expect(parseStep).toContain('formatGithubOutput');
    expect(parseStep).not.toContain('failed.length > 0 || skipped.length > 0');
  });

  it('uploads public-profile screenshots only through the bounded test-results artifact', () => {
    const workflow = readFileSync(workflowPath, 'utf8');
    const uploadStep = getStepBlock(workflow, 'Upload test results');

    expect(workflow).not.toContain('Upload Public Profile Smoke Screenshots');
    expect(workflow).not.toContain('public-profile-smoke-screenshots');
    expect(uploadStep).toContain('apps/web/test-results/');
    expect(uploadStep).toContain('retention-days: 30');
  });

  it('replaces the destructive account canary with the retained waitlist traversal', () => {
    for (const path of [workflowPath, agentTickWorkflowPath]) {
      const workflow = readFileSync(path, 'utf8');
      const canaryStep = getStepBlock(
        workflow,
        'Run Production Waitlist Canary'
      );

      expect(canaryStep).toContain("E2E_SYNTHETIC_MODE: 'true'");
      expect(canaryStep).toContain(
        'tests/e2e/synthetic-production-waitlist.spec.ts'
      );
      expect(canaryStep).toContain(
        'E2E_PROD_SIGNUP_EMAIL_BASE,E2E_PROD_MAILBOX_PROVIDER,E2E_PROD_OTP_CHECK_ORIGIN,E2E_PROD_OTP_CHECK_TOKEN,E2E_PROD_OTP_CHECK_URL,PRODUCTION_WAITLIST_CANARY_READ_TOKEN'
      );
      expect(canaryStep).toContain('--no-fallback -- env -u DOPPLER_TOKEN');
      expect(canaryStep).toContain('secrets missing from jovie-web/prd');
      expect(canaryStep).not.toContain('DATABASE_URL');
      expect(workflow).toContain(
        'SYNTHETIC_PLAYWRIGHT_JSON_OUTPUT_FILE: test-results/synthetic-production-waitlist-results.json'
      );
    }
  });

  it('escapes multiline failed_tests output so the Slack payload stays valid JSON', () => {
    const failedTests = [
      'synthetic-production-waitlist: Test results file not found (apps/web/test-results/synthetic-production-waitlist-results.json)',
      'Skipped tests:',
      'onboarding-robot-full: creates a profile, verifies dashboard/public profile, and cleans up',
    ].join('\n');
    const escapedExpression =
      "${{ toJSON(format('```{0}```', steps.test-results.outputs.failed_tests)) }}";

    for (const path of [workflowPath, agentTickWorkflowPath]) {
      const workflow = readFileSync(path, 'utf8');
      const alertStep = getStepBlock(workflow, 'Send Slack Alert on Failure');

      expect(alertStep).toContain(escapedExpression);
      expect(alertStep).not.toContain(
        '${{ steps.test-results.outputs.failed_tests }}'
      );

      const payload = alertStep
        .split('custom_payload: |')[1]!
        .split('\n        env:')[0]!
        .split('\n')
        .map(line => line.replace(/^ {12}/, ''))
        .join('\n')
        .replace(
          escapedExpression,
          JSON.stringify(`\`\`\`${failedTests}\`\`\``)
        )
        .replace(/\$\{\{[^}]*\}\}/g, 'x');

      expect(() => JSON.parse(payload)).not.toThrow();
    }
  });

  it('runs the five-surface Web AI health probe once daily through production cron auth', () => {
    const workflow = readFileSync(workflowPath, 'utf8');

    expect(workflow).toContain("- cron: '47 7 * * *'");
    expect(workflow).toContain("github.event.schedule == '47 7 * * *'");
    expect(workflow).toContain('name: Web AI Health (Daily)');
    expect(workflow).toContain('--only-secrets=CRON_SECRET --no-fallback');
    expect(workflow).toContain('--url https://jov.ie/api/cron/web-ai-health');
    expect(workflow).toContain('scripts/web-ai-health-intake.mjs');
    expect(workflow).toContain('name: File high-priority Linear bug signal');
    expect(workflow).not.toContain(
      '--only-secrets=AI_GATEWAY_API_KEY --no-fallback'
    );
  });

  it('keeps the workflow receipt validator on the canonical gateway allowlist name', () => {
    const runner = readFileSync(webAiHealthRunnerPath, 'utf8');

    expect(runner).toContain(`'${GATEWAY_ALLOWLIST_NAME}'`);
  });
});
