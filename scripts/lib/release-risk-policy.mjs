#!/usr/bin/env node

import { readFileSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

export const RELEASE_RISK_POLICY_VERSION =
  'jovie.release-risk-policy/2026-09-28.1';
const SCHEMA = 'jovie.release-risk-receipt/v1';
const LANES = ['not_applicable', 'low', 'medium', 'high'];
const WEIGHT = Object.fromEntries(LANES.map((lane, index) => [lane, index]));
const TARGET = { not_applicable: 0, low: 300, medium: 900, high: 1800 };
const PROOF = {
  not_applicable: ['sealed-no-web-impact'],
  low: 'exact-ci-risk-receipt exact-production-candidate targeted-build targeted-surface-smoke'.split(
    ' '
  ),
  medium:
    'exact-ci-risk-receipt exact-production-candidate selected-integration targeted-canary'.split(
      ' '
    ),
  high: 'exact-ci-risk-receipt exact-production-candidate full-selected-evidence targeted-canary rollback-proof high-confidence-runtime-proof'.split(
    ' '
  ),
};
function normalizeRisk(input) {
  const present = input && typeof input === 'object';
  const level =
    present && ['low', 'medium', 'high'].includes(input.riskLevel)
      ? input.riskLevel
      : 'unknown';
  const uncertainties = present ? [] : ['missing exact CI risk receipt'];
  if (level === 'unknown') uncertainties.push('unknown risk level');
  const flag = key => {
    if (present && typeof input[key] === 'boolean') return input[key];
    uncertainties.push(`unknown ${key}`);
    return true;
  };
  return {
    riskLevel: level,
    requiresSmoke: flag('requiresSmoke'),
    requiresPreview: flag('requiresPreview'),
    blocksUnattended: flag('blocksUnattended'),
    matchedRuleIds:
      present && Array.isArray(input.matchedRuleIds)
        ? [...new Set(input.matchedRuleIds.filter(Boolean))]
        : [],
    uncertainties,
  };
}
export function buildReleaseRiskReceipt(input) {
  const { lineageSha, deployableWeb, mergeAt } = input;
  if (!/^[0-9a-f]{40}$/.test(lineageSha ?? ''))
    throw new Error('invalid lineageSha');
  if (typeof deployableWeb !== 'boolean')
    throw new Error('deployableWeb must be known');
  if (Number.isNaN(Date.parse(mergeAt))) throw new Error('invalid mergeAt');
  const risk = normalizeRisk(input.riskReceipt);
  let originalLane = deployableWeb ? risk.riskLevel : 'not_applicable';
  if (originalLane === 'unknown' || (deployableWeb && risk.blocksUnattended))
    originalLane = 'high';
  let selectedLane = originalLane;
  let overrideReceipt = null;
  if (input.override) {
    const override = input.override;
    if (
      !override.id ||
      !override.actor ||
      !override.reason ||
      !LANES.includes(override.requestedLane)
    ) {
      throw new Error('invalid override');
    }
    if (WEIGHT[override.requestedLane] < WEIGHT[originalLane])
      throw new Error('override cannot lower the original release lane');
    selectedLane = override.requestedLane;
    overrideReceipt = { ...override, originalLane };
  }
  const requiredProof = [...PROOF[selectedLane]];
  if (risk.requiresSmoke && deployableWeb)
    requiredProof.push('risk-required-smoke');
  if (risk.requiresPreview && deployableWeb)
    requiredProof.push('risk-required-staging-preview');
  const certificationRequired =
    selectedLane === 'high' && risk.blocksUnattended;
  const receipt = {
    schema: SCHEMA,
    policyVersion: RELEASE_RISK_POLICY_VERSION,
    lineageSha,
    originalClassification: { ...risk, selectedLane: originalLane },
    override: overrideReceipt,
    selectedLane,
    selectedProductLanes: [...new Set(input.selectedProductLanes ?? [])],
    requiredProof,
    promotion: {
      mutateStaging: deployableWeb,
      mutateProduction: deployableWeb,
      unattendedAllowed: !certificationRequired,
      certificationRequired,
    },
    latency: {
      mergeAt: new Date(mergeAt).toISOString(),
      terminalAt: null,
      measuredSeconds: null,
      targetP95Seconds: TARGET[selectedLane],
      withinTarget: null,
    },
  };
  const ovie = {
    riskInputs: receipt.originalClassification,
    policyVersion: receipt.policyVersion,
    selectedLane,
    requiredProof,
    measuredLatencySeconds: null,
  };
  return {
    ...receipt,
    ovie,
    certificationPacket: certificationRequired
      ? {
          contract: 'jovie.ovi-release-certification/v1',
          id: `release:${lineageSha}:${RELEASE_RISK_POLICY_VERSION}`,
          evidence: { ...ovie, lineageSha },
          nextDecision: `Certify whether exact release ${lineageSha} may promote to production.`,
        }
      : null,
  };
}
export function measureReleaseRiskReceipt(receipt, terminalAt) {
  const seconds = Math.max(
    0,
    Math.round(
      (Date.parse(terminalAt) - Date.parse(receipt.latency.mergeAt)) / 1000
    )
  );
  const latency = {
    ...receipt.latency,
    terminalAt: new Date(terminalAt).toISOString(),
    measuredSeconds: seconds,
    withinTarget: seconds <= receipt.latency.targetP95Seconds,
  };
  const ovie = { ...receipt.ovie, measuredLatencySeconds: seconds };
  const next = { ...receipt, latency, ovie };
  return next.certificationPacket
    ? {
        ...next,
        certificationPacket: {
          ...next.certificationPacket,
          evidence: {
            ...next.certificationPacket.evidence,
            measuredLatencySeconds: seconds,
          },
        },
      }
    : next;
}
function arg(args, name) {
  const index = args.indexOf(`--${name}`);
  if (index < 0 || !args[index + 1]) throw new Error(`--${name} is required`);
  return args[index + 1];
}
function runCli(args) {
  const command = args[0];
  const out = arg(args, 'out');
  if (command === 'measure') {
    const receipt = JSON.parse(readFileSync(arg(args, 'receipt'), 'utf8'));
    writeFileSync(
      out,
      `${JSON.stringify(measureReleaseRiskReceipt(receipt, arg(args, 'terminal-at')), null, 2)}\n`
    );
    return;
  }
  if (command !== 'plan') throw new Error('expected plan or measure');
  const release = JSON.parse(readFileSync(arg(args, 'release'), 'utf8'));
  const range = JSON.parse(readFileSync(arg(args, 'range'), 'utf8'));
  const receipt = buildReleaseRiskReceipt({
    lineageSha: range.currentSha,
    riskReceipt: release.actualResults?.riskReceipt,
    deployableWeb: range.selectedLanes.includes('web'),
    selectedProductLanes: range.selectedLanes,
    mergeAt: arg(args, 'merge-at'),
  });
  writeFileSync(out, `${JSON.stringify(receipt, null, 2)}\n`);
  const githubOutput = args.includes('--github-output')
    ? arg(args, 'github-output')
    : null;
  if (githubOutput) {
    const values = {
      release_lane: receipt.selectedLane,
      release_policy_version: receipt.policyVersion,
      release_target_seconds: receipt.latency.targetP95Seconds,
      release_unattended_allowed: receipt.promotion.unattendedAllowed,
      release_certification_required: receipt.promotion.certificationRequired,
      release_requires_smoke: receipt.originalClassification.requiresSmoke,
    };
    writeFileSync(
      githubOutput,
      `${Object.entries(values)
        .map(([key, value]) => `${key}=${value}`)
        .join('\n')}\n`,
      { flag: 'a' }
    );
  }
}
if (import.meta.url === pathToFileURL(process.argv[1]).href)
  runCli(process.argv.slice(2));
