import { execFileSync, spawnSync } from 'node:child_process';
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { load as parseYaml } from 'js-yaml';
import { describe, expect, it } from 'vitest';
import {
  cronGapMinutes,
  workflowTriggers,
} from '../../../../../scripts/lib/workflow-triggers.mjs';

const testDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(testDir, '..', '..', '..', '..', '..');
const ci = readFileSync(resolve(repoRoot, '.github/workflows/ci.yml'), 'utf8');
const nightly = readFileSync(
  resolve(repoRoot, '.github/workflows/golden-path-nightly.yml'),
  'utf8'
);
const packageJson = JSON.parse(
  readFileSync(resolve(repoRoot, 'apps/web/package.json'), 'utf8')
) as { scripts: Record<string, string> };
const parsedCi = parseYaml(ci) as {
  jobs: Record<
    string,
    {
      if?: string;
      'timeout-minutes'?: number;
      outputs?: { journey_outcome?: string; certification_outcome?: string };
      steps?: readonly {
        id?: string;
        name?: string;
        run?: string;
        if?: string;
        'continue-on-error'?: boolean;
      }[];
    }
  >;
};

describe('JOV-6572 canonical artist-site certification workflow', () => {
  it('runs the exact approved profile and outbound journey on the daily lane', () => {
    const command = packageJson.scripts['test:e2e:golden-path:ci'];
    expect(command).toContain('claim-prebuilt.smoke.spec.ts');
    expect(command).toContain('golden-path-home-welcome.spec.ts');
    expect(command).toContain('golden-path.spec.ts');
    expect(command).toContain('start-entry-continuity.spec.ts');
    expect(command).toContain('entry-first-html-visual.spec.ts');
    expect(command).toContain('GOLDEN_PATH_REQUIRED=1');
    expect(command).not.toContain('money-path-persistence.spec.ts');
    expect(ci).toContain('Seed required premade profile claim fixture');
    expect(ci).toContain('pnpm --filter=@jovie/web run seed:test-data');
    expect(cronGapMinutes(workflowTriggers(nightly)).max).toBeLessThanOrEqual(
      1440
    );
    expect(nightly).toContain('workflow run ci.yml');
  });

  it('provides an ephemeral signing key before starting the claim server (JOV-8550)', () => {
    const journey = parsedCi.jobs['ci-golden-path']?.steps?.find(
      step => step.id === 'canonical_journey'
    );
    const script = journey?.run ?? '';
    const keySetup = script.match(
      /^URL_ENCRYPTION_KEY="\$\(openssl rand -base64 32\)"\r?\nexport URL_ENCRYPTION_KEY$/m
    )?.[0];
    expect(
      keySetup,
      'Pending claim cookies require a runtime signing key'
    ).toBeTruthy();
    expect(script).not.toMatch(/^export [A-Z0-9_]+="?\$\(/m);
    expect(script.indexOf(keySetup!)).toBeLessThan(
      script.indexOf('PORT=3250 node .next/standalone/apps/web/server.js')
    );
    const generateKey = () =>
      execFileSync(
        'bash',
        [
          '-eu',
          '-c',
          `${keySetup}
node -e 'process.stdout.write(process.env.URL_ENCRYPTION_KEY)'`,
        ],
        {
          encoding: 'utf8',
        }
      ).trim();
    const first = generateKey();
    const second = generateKey();
    expect(Buffer.from(first, 'base64')).toHaveLength(32);
    expect(Buffer.from(second, 'base64')).toHaveLength(32);
    expect(first).not.toBe(second);
  });

  it('joins production-faithful, deployed-profile, and live revenue evidence', () => {
    expect(ci).toContain('id: canonical_journey');
    expect(ci).toContain('id: canonical_claim_contract');
    expect(ci).toContain('id: canonical_waitlist');
    expect(ci).toContain('id: canonical_revenue');
    expect(ci).toContain('id: canonical_profile');
    expect(ci).toContain('id: canonical_navigation');
    expect(ci).toContain('scripts/m2-revenue-path-canary.ts');
    expect(ci).toContain('scripts/certify-artist-profile.ts');
    expect(ci).toContain('scripts/certify-canonical-artist-site.ts');
    expect(ci).toContain('lib/claim/finalize.test.ts');
    const claimCommand = ci.slice(
      ci.indexOf('id: canonical_claim_contract'),
      ci.indexOf('id: canonical_waitlist')
    );
    expect(claimCommand).toContain('lib/claim/finalize.test.ts');
    expect(claimCommand).not.toContain('waitlist-gating.test.ts');
    expect(ci).toContain('tests/unit/auth/waitlist-gating.test.ts');
    expect(ci).toContain('lib/auth/canonical-user-state.test.ts');
    expect(ci).toContain('tests/unit/lib/auth/access-route-matrix.test.ts');
    expect(ci).toContain('--source-revision "${{ github.sha }}"');
    expect(ci).toContain('--waitlist-status "$WAITLIST_STATUS"');
    expect(ci).toContain('--navigation-status "$NAVIGATION_STATUS"');
    const navigation = parsedCi.jobs['ci-golden-path']?.steps?.find(
      step => step.id === 'canonical_navigation'
    );
    expect(navigation?.run).toContain(
      'tests/e2e/canonical-artist-navigation.spec.ts'
    );
    expect(navigation?.run).toContain("--grep 'canonical artist navigation'");
    expect(navigation?.run).toContain('--retries=0');
    expect(navigation?.run).toContain(
      'guard-playwright-artifacts.mjs --run --'
    );
    expect(navigation?.['continue-on-error']).toBe(true);
    expect(ci).toContain("steps.canonical_navigation.outcome || 'skipped'");
    const certify = ci.slice(
      ci.indexOf('id: canonical_certification'),
      ci.indexOf('Upload canonical artist-site certification')
    );
    expect(certify).toContain('GH_TOKEN: ${{ github.token }}');
    expect(certify).toContain(
      '--source-history "$CERT_DIR/source-history.txt"'
    );
    expect(certify).toContain(
      'repos/${{ github.repository }}/commits?sha=${{ github.sha }}&per_page=100&page=${page}'
    );
    expect(certify).toContain('for page in 1 2 3 4 5; do');
    // Rate-limit guard: page only until the live build is found, never past a failure.
    expect(certify).toContain('"$CERT_DIR/profile-result.json"');
    expect(certify).not.toContain('curl ');
    expect(certify).toContain(
      'node packages/api-client/cli.ts gh --priority deploy -- api'
    );
    expect(certify).toContain('grep -q "^$LIVE_BUILD" "$HISTORY"');
    expect(certify).toContain('if [ "$failed" -ne 0 ]; then break; fi');
    expect(certify).toContain('>> "$HISTORY" || failed=1');
    expect(certify).toContain(': > "$HISTORY"');
    expect(certify).not.toContain('git fetch');
    const certifyScript =
      parsedCi.jobs['ci-golden-path']?.steps?.find(
        step => step.id === 'canonical_certification'
      )?.run ?? '';
    expect(certifyScript.indexOf(': > "$HISTORY"')).toBeGreaterThan(-1);
    expect(certifyScript.indexOf(': > "$HISTORY"')).toBeLessThan(
      certifyScript.indexOf('scripts/certify-canonical-artist-site.ts')
    );
    expect(ci).toContain('steps.canonical_journey.outcome');
    expect(ci).toContain('steps.canonical_claim_contract.outcome');
    expect(ci).toContain('steps.canonical_waitlist.outcome');
    expect(ci).toContain('steps.canonical_revenue.outcome');
    expect(ci).toContain('steps.canonical_profile.outcome');
  });

  it.each([false, true])(
    'executes the real history reader with one page when first-page failure is %s',
    failFirstPage => {
      const directory = mkdtempSync(join(tmpdir(), 'certification-history-'));
      try {
        const source = 'a'.repeat(40);
        const live = 'b'.repeat(40);
        const certDir = join(directory, 'certificate');
        const bin = join(directory, 'bin');
        const client = join(directory, 'packages/api-client');
        for (const target of [certDir, bin, client]) {
          mkdirSync(target, { recursive: true });
        }
        const profileReport = join(directory, 'profile-report.json');
        writeFileSync(
          profileReport,
          JSON.stringify({ snapshot: { releaseSha: live } })
        );
        writeFileSync(
          join(certDir, 'profile-result.json'),
          JSON.stringify({ reportPath: profileReport })
        );
        writeFileSync(
          join(client, 'cli.ts'),
          `const fs = require('node:fs');
fs.appendFileSync(process.env.CALL_LOG, JSON.stringify(process.argv.slice(2)) + '\\n');
if (process.env.FAIL_FIRST_PAGE === '1') process.exit(75);
process.stdout.write('${source}\\n${live}\\n');
`
        );
        writeFileSync(
          join(bin, 'gh'),
          '#!/bin/sh\nexec node packages/api-client/cli.ts gh --priority deploy -- "$@"\n',
          { mode: 0o700 }
        );
        writeFileSync(
          join(bin, 'pnpm'),
          '#!/bin/sh\nprintf "%s\\n" "$@" > "$PNPM_ARGS"\n',
          { mode: 0o700 }
        );
        writeFileSync(
          join(bin, 'curl'),
          '#!/bin/sh\necho unexpected-production-read >&2\nexit 97\n',
          { mode: 0o700 }
        );
        const script = parsedCi.jobs['ci-golden-path'].steps?.find(
          step => step.id === 'canonical_certification'
        )?.run;
        expect(script).toBeTruthy();
        const run = script!.replace(
          /\$\{\{\s*([^}]+)\s*\}\}/g,
          (_match, key: string) => {
            if (key.trim() === 'github.sha') return source;
            if (key.trim() === 'github.repository') return 'fixture/repository';
            if (key.trim() === 'runner.temp') return directory;
            return 'fixture';
          }
        );
        const callLog = join(directory, 'calls.jsonl');
        const pnpmArgs = join(directory, 'pnpm-args');
        const result = spawnSync('bash', ['-e', '-o', 'pipefail', '-c', run], {
          cwd: directory,
          encoding: 'utf8',
          timeout: 10000,
          env: {
            ...process.env,
            PATH: `${bin}:${process.env.PATH}`,
            CERT_DIR: certDir,
            CALL_LOG: callLog,
            PNPM_ARGS: pnpmArgs,
            FAIL_FIRST_PAGE: failFirstPage ? '1' : '0',
          },
        });
        expect(result.status, result.stderr).toBe(0);
        expect(result.stderr).not.toContain('unexpected-production-read');
        const calls = readFileSync(callLog, 'utf8').trim().split('\n');
        expect(calls).toHaveLength(1);
        expect(calls[0]).toContain('per_page=100&page=1');
        expect(readFileSync(join(certDir, 'source-history.txt'), 'utf8')).toBe(
          failFirstPage ? '' : `${source}\n${live}\n`
        );
        expect(readFileSync(pnpmArgs, 'utf8')).toContain('--journey-report\n');
      } finally {
        rmSync(directory, { recursive: true, force: true });
      }
    }
  );

  it('always persists the certificate and fails the job on RED', () => {
    const steps = parsedCi.jobs['ci-golden-path']?.steps ?? [];
    const step = (id: string) => steps.find(candidate => candidate.id === id);
    expect(ci).toContain('id: canonical_certification');
    expect(ci).toContain('if: ${{ always() && !cancelled() }}');
    expect(ci).toContain('--output "$CERT_DIR/certificate.json"');
    expect(ci).toContain('Upload canonical artist-site certification');
    expect(ci).toContain('retention-days: 30');
    expect(ci).toContain('scripts/golden-path-nightly-intake.mjs');
    expect(ci).toContain('scripts/canonical-artist-site-intake.mjs');
    expect(ci).toContain(
      'canonical-artist-site-certification-${{ github.run_id }}-${{ github.run_attempt }}'
    );
    expect(parsedCi.jobs['ci-golden-path']?.['timeout-minutes']).toBe(40);
    expect(parsedCi.jobs['ci-golden-path']?.outputs?.journey_outcome).toContain(
      'canonical_journey'
    );
    const reportSteps = parsedCi.jobs['ci-golden-path-report']?.steps ?? [];
    expect(reportSteps.at(-1)?.name).toBe(
      'File or resolve the Golden Path Linear issue'
    );
    expect(step('canonical_journey')?.['continue-on-error']).toBe(true);
    expect(step('canonical_claim_contract')?.['continue-on-error']).toBe(true);
    expect(step('canonical_waitlist')?.['continue-on-error']).toBe(true);
    expect(step('canonical_revenue')?.['continue-on-error']).toBe(true);
    expect(step('canonical_profile')?.['continue-on-error']).toBe(true);
    expect(step('canonical_certification')?.['continue-on-error']).toBeFalsy();
    expect(step('canonical_certification')?.if).toBe(
      '${{ always() && !cancelled() }}'
    );
  });

  it('still certifies when the shared database lane fails (JOV-8614)', () => {
    const gate = parsedCi.jobs['ci-golden-path']?.if ?? '';
    expect(gate).toContain('always()');
    expect(gate).toContain('!cancelled()');
    expect(gate).toContain("github.event_name == 'workflow_dispatch'");
    expect(gate).toContain(
      "github.event_name == 'push' && github.ref == 'refs/heads/main'"
    );
    expect(gate).toContain("needs.neon-db.result == 'success'");
    expect(gate).toContain("needs.neon-db.result == 'failure'");
    expect(gate).not.toContain("'merge_group'");
    const report = ci.slice(
      ci.indexOf('  ci-golden-path-report:'),
      ci.indexOf('  ci-admin-smoke:')
    );
    expect(report).toContain(
      'PRODUCER_RESULT: ${{ needs.ci-golden-path.result }}'
    );
    expect(report).toContain(
      'PRODUCER_RESULT="$PRODUCER_RESULT" node scripts/canonical-artist-site-intake.mjs'
    );
  });
});
