import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { planProductionLaneRange } from '../production-lane-range.mjs';
import {
  buildReleaseRiskReceipt,
  measureReleaseRiskReceipt,
} from '../release-risk-policy.mjs';

const sha = 'a'.repeat(40);
const base = {
  lineageSha: sha,
  deployableWeb: true,
  mergeAt: '2026-10-03T12:00:00.000Z',
};
const risk = (risk_level, flags = {}) => ({
  sha,
  risk_level,
  requires_smoke: false,
  requires_preview: false,
  blocks_unattended: false,
  ...flags,
});

const plan = (riskReceipt, extra = {}) =>
  buildReleaseRiskReceipt({ ...base, riskReceipt, ...extra });

describe('release risk policy', () => {
  it.each([
    ['copy-only UI', 'low', {}, 'low', 300],
    ['reversible component', 'low', {}, 'low', 300],
    ['API write', 'medium', { requires_smoke: true }, 'medium', 900],
    ['auth boundary', 'high', { requires_preview: true }, 'high', 1800],
    ['migration', 'high', { requires_smoke: true }, 'high', 1800],
    ['payment', 'high', { requires_preview: true }, 'high', 1800],
    ['domain/routing', 'high', { requires_preview: true }, 'high', 1800],
    ['infrastructure', 'high', { requires_smoke: true }, 'high', 1800],
  ])('maps the existing %s receipt', (_name, level, flags, lane, target) => {
    const receipt = plan(risk(level, flags));
    expect(receipt).toMatchObject({
      policyVersion: 'jovie.release-risk-policy/2026-10-03.1',
      selectedLane: lane,
      latency: { targetP95Seconds: target },
      promotion: { unattendedAllowed: true },
    });
    expect(receipt.requiredProof).toContain(
      lane === 'low'
        ? 'targeted-surface-smoke'
        : lane === 'medium'
          ? 'selected-integration'
          : 'full-selected-evidence'
    );
  });

  it('emits an immediate not-applicable no-op lineage without mutation', () => {
    expect(
      plan(risk('high', { blocks_unattended: true }), {
        deployableWeb: false,
      })
    ).toMatchObject({
      selectedLane: 'not_applicable',
      promotion: { mutateStaging: false, mutateProduction: false },
    });
  });

  it('fails unknown evidence red and emits one exact Ovi decision packet', () => {
    const unknown = plan(null);
    expect(unknown.evidenceState).toBe('red');
    expect(unknown.promotion.certificationRequired).toBe(true);
    const ambiguous = plan(
      risk('high', {
        blocks_unattended: true,
        matched_rule_ids: ['ambiguous-authority'],
      })
    );
    expect(ambiguous.certificationPacket.id).toContain(`release:${sha}:`);
    expect(ambiguous.certificationPacket.nextDecision).toContain(sha);
  });

  it('records the measured SLO for Ovi', () => {
    const planned = plan(risk('medium'));
    const measured = measureReleaseRiskReceipt(
      planned,
      '2026-10-03T12:14:00.000Z'
    );
    expect(measured.latency).toMatchObject({
      measuredSeconds: 840,
      targetP95Seconds: 900,
    });
    expect(measured.ovie.measuredLatencySeconds).toBe(840);
  });
});

describe('release risk CLI routing', () => {
  const invoke = (range, assertions) => {
    const directory = mkdtempSync(join(tmpdir(), 'release-risk-routing-'));
    const releasePath = join(directory, 'release.json');
    const rangePath = join(directory, 'range.json');
    const out = join(directory, 'risk.json');
    const outputPath = join(directory, 'github-output');
    try {
      writeFileSync(
        releasePath,
        JSON.stringify({ actualResults: { riskReceipt: risk('medium') } })
      );
      writeFileSync(rangePath, JSON.stringify(range));
      const result = spawnSync(
        process.execPath,
        [
          fileURLToPath(new URL('../release-risk-policy.mjs', import.meta.url)),
          'plan',
          '--release',
          releasePath,
          '--range',
          rangePath,
          '--merge-at',
          base.mergeAt,
          '--out',
          out,
          '--github-output',
          outputPath,
        ],
        { encoding: 'utf8' }
      );
      assertions({ result, out, outputPath });
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  };

  it.each([
    [
      'operations-only live binding (run 39025950313)',
      ['scripts/lanes/lane_runner.py'],
    ],
    ['native-only live binding', ['apps/ios/Jovie/DashboardView.swift']],
    ['selected Web', ['apps/web/app/page.tsx']],
    ['already bound current head', []],
  ])('honors the canonical planner for %s', (_name, changedPaths) => {
    const deployedSha = changedPaths.length ? 'b'.repeat(40) : sha;
    const range = planProductionLaneRange({
      deployedSha,
      currentSha: sha,
      cumulativeChangedPaths: changedPaths,
      commitsNewestFirst: changedPaths.length
        ? [{ sha, firstParent: deployedSha, changedPaths }]
        : [],
    });
    invoke(range, ({ result, out, outputPath }) => {
      expect(result.status, result.stderr).toBe(0);
      const receipt = JSON.parse(readFileSync(out, 'utf8'));
      expect(receipt).toMatchObject({
        lineageSha: sha,
        selectedLane: changedPaths.length ? 'medium' : 'not_applicable',
        promotion: {
          mutateStaging: changedPaths.length > 0,
          mutateProduction: changedPaths.length > 0,
        },
      });
      expect(readFileSync(outputPath, 'utf8')).toContain(
        `release_lane=${receipt.selectedLane}\n`
      );
      if (changedPaths.length) {
        expect(receipt.requiredProof).toContain('verified-staging-identity');
        expect(receipt.requiredProof).toContain('verified-production-identity');
      }
    });
  });

  it('rejects an unknown deployment decision instead of emitting a no-op', () => {
    invoke({ currentSha: sha, selectedLanes: ['operations'] }, ({ result }) => {
      expect(result.status).not.toBe(0);
      expect(result.stderr).toContain('deployableWeb must be known');
    });
  });
});
