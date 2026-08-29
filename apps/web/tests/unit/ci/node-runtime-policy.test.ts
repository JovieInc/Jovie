import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  evaluateOfficialReleases,
  getReleaseStatus,
  isPromotionReady,
  validateRepositoryPolicy,
} from '../../../../../scripts/node-runtime-policy.mjs';

const testDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(testDir, '..', '..', '..', '..', '..');
const policy = JSON.parse(
  readFileSync(resolve(repoRoot, 'config/node-runtime-policy.json'), 'utf8')
);
const now = new Date('2026-08-28T12:00:00Z');
const schedule = {
  v22: {
    start: '2024-04-24',
    lts: '2024-10-29',
    maintenance: '2025-10-21',
    end: '2027-04-30',
  },
  v24: {
    start: '2025-05-06',
    lts: '2025-10-28',
    maintenance: '2026-10-20',
    end: '2028-04-30',
  },
  v26: {
    start: '2026-04-22',
    lts: '2026-10-28',
    maintenance: '2027-10-20',
    end: '2029-04-30',
  },
};
const releaseIndex = [
  { version: 'v26.8.1', date: '2026-08-25', security: false },
  { version: 'v24.20.0', date: '2026-08-25', security: false },
  { version: 'v22.23.2', date: '2026-08-12', security: true },
];
describe('Node runtime lifecycle policy', () => {
  it('keeps checked-in production pins and promotion safety rules aligned', () => {
    const result = validateRepositoryPolicy(policy, repoRoot);
    expect(result.errors).toEqual([]);
    expect(result.productionVersion).toBe(
      readFileSync(resolve(repoRoot, '.nvmrc'), 'utf8').trim()
    );
    expect(policy.promotion.minimumConsecutiveGreenRuns).toBeGreaterThanOrEqual(
      2
    );
    expect(policy.rollback.maximumMinutes).toBeLessThanOrEqual(30);
  });
  it('classifies LTS and current releases using official schedule boundaries', () => {
    expect(getReleaseStatus(schedule.v22, now)).toBe('maintenance_lts');
    expect(getReleaseStatus(schedule.v24, now)).toBe('active_lts');
    expect(getReleaseStatus(schedule.v26, now)).toBe('current');
    expect(() =>
      getReleaseStatus({ ...schedule.v24, lts: 'invalid' }, now)
    ).toThrow('Invalid schedule boundary lts: invalid');
  });
  it('resolves Node 24 as blocking candidate and Node 26 as non-blocking shadow', () => {
    const result = evaluateOfficialReleases({
      policy: { ...policy, productionVersion: '22.23.2' },
      schedule,
      index: releaseIndex,
      now,
    });
    expect(result.errors).toEqual([]);
    expect(result.production).toEqual({
      version: '22.23.2',
      latest: '22.23.2',
      status: 'maintenance_lts',
    });
    expect(
      result.matrix.map(candidate => [
        candidate.major,
        candidate.version,
        candidate.ring,
        candidate.blocking,
        candidate.status,
        candidate.minimumPromotionStatus,
      ])
    ).toEqual([
      [24, '24.20.0', 'candidate', true, 'active_lts', 'active_lts'],
      [26, '26.8.1', 'shadow', false, 'current', 'active_lts'],
    ]);
  });
  it('does not hide an overdue security release behind a newer regular patch', () => {
    const result = evaluateOfficialReleases({
      policy: { ...policy, productionVersion: '22.23.0' },
      schedule,
      index: [
        ...releaseIndex.filter(release => !release.version.startsWith('v22')),
        { version: 'v22.23.2', date: '2026-08-20', security: false },
        { version: 'v22.23.1', date: '2026-08-01', security: true },
      ],
      now,
    });
    expect(result.errors).toContain(
      'Production 22.23.0 trails v22.23.1 beyond the security patch SLA'
    );
  });
  it('rejects a production pin absent from the official release index', () => {
    const result = evaluateOfficialReleases({
      policy: { ...policy, productionVersion: '22.99.99' },
      schedule,
      index: releaseIndex,
      now,
    });
    expect(result.errors).toContain(
      'Production 22.99.99 is missing from the official release index'
    );
  });
  it('fails closed when production exceeds patch or lifecycle bounds', () => {
    const stale = evaluateOfficialReleases({
      policy: { ...policy, productionVersion: '22.23.1' },
      schedule,
      index: releaseIndex,
      now,
    });
    expect(stale.errors).toContain(
      'Production 22.23.1 trails v22.23.2 beyond the security patch SLA'
    );
    const afterEol = evaluateOfficialReleases({
      policy: { ...policy, productionVersion: '22.23.2' },
      schedule,
      index: releaseIndex,
      now: new Date('2027-05-01T00:00:00Z'),
    });
    expect(afterEol.errors).toContain(
      'Production Node 22 is end_of_life, not an allowed LTS status'
    );
  });
  it('requires both consecutive green runs and the soak window before promotion', () => {
    const lts = { major: 24, status: 'active_lts' };
    expect(isPromotionReady(policy, lts, 2, 18)).toBe(false);
    expect(isPromotionReady(policy, lts, 3, 18)).toBe(true);
    const currentMinimum = structuredClone(policy);
    currentMinimum.compatibility.candidates[1].minimumPromotionStatus =
      'current';
    expect(
      isPromotionReady(
        currentMinimum,
        { major: 26, status: 'active_lts' },
        3,
        18
      )
    ).toBe(true);
    expect(
      isPromotionReady(policy, { major: 26, status: 'current' }, 20, 18)
    ).toBe(false);
  });
  it('keeps compatibility work recurring, isolated, and promotion-gated', () => {
    const workflow = readFileSync(
      resolve(repoRoot, '.github/workflows/node-runtime-compatibility.yml'),
      'utf8'
    );
    const freshness = readFileSync(
      resolve(repoRoot, '.github/workflows/node-runtime-freshness.yml'),
      'utf8'
    );
    expect(workflow).toContain('schedule:');
    expect(workflow).toContain("cron: '47 16 * * 1'");
    expect(freshness).toContain("cron: '17 16 * * *'");
    expect(workflow).toContain('workflow_dispatch:');
    expect(workflow).toContain(
      'matrix: ${{ fromJSON(needs.policy.outputs.matrix) }}'
    );
    expect(workflow).toContain('continue-on-error: ${{ !matrix.blocking }}');
    expect(workflow).toContain('pnpm install --frozen-lockfile');
    expect(workflow).toContain(
      'node scripts/node-runtime-policy.mjs runtime-smoke'
    );
    expect(workflow).toContain('pnpm --filter @jovie/web run typecheck');
    expect(workflow).toContain('pnpm --filter @jovie/web run test:ci');
    expect(workflow).toContain('pnpm --filter @jovie/web run build');
    expect(workflow).toContain('gh issue create');
    expect(workflow).not.toContain('runner-setup-action.test.ts');
    expect(freshness).not.toContain('compatibility:');
  });
});
