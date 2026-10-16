import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
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
    expect(ci).toContain('id: canonical_revenue');
    expect(ci).toContain('id: canonical_profile');
    expect(ci).toContain('scripts/m2-revenue-path-canary.ts');
    expect(ci).toContain('scripts/certify-artist-profile.ts');
    expect(ci).toContain('scripts/certify-canonical-artist-site.ts');
    expect(ci).toContain('lib/claim/finalize.test.ts');
    expect(ci).toContain('tests/unit/auth/waitlist-gating.test.ts');
    expect(ci).toContain('--source-revision "${{ github.sha }}"');
    expect(ci).toContain('steps.canonical_journey.outcome');
    expect(ci).toContain('steps.canonical_claim_contract.outcome');
    expect(ci).toContain('steps.canonical_revenue.outcome');
    expect(ci).toContain('steps.canonical_profile.outcome');
  });

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
    expect(step('canonical_revenue')?.['continue-on-error']).toBe(true);
    expect(step('canonical_profile')?.['continue-on-error']).toBe(true);
    expect(step('canonical_certification')?.['continue-on-error']).toBeFalsy();
    expect(step('canonical_certification')?.if).toBe(
      '${{ always() && !cancelled() }}'
    );
  });
});
