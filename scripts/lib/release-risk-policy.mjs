#!/usr/bin/env node

import { readFileSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

export const RELEASE_RISK_POLICY_VERSION =
  'jovie.release-risk-policy/2026-10-03.1';
const LANES = ['not_applicable', 'low', 'medium', 'high'];
const WEIGHT = Object.fromEntries(LANES.map((lane, index) => [lane, index]));
const TARGET = { not_applicable: 0, low: 300, medium: 900, high: 1800 };
const PROOF = {
  not_applicable: ['exact-main-ci', 'sealed-no-deployable-web-impact'],
  low: 'exact-main-ci staging-controller-authorization staging-generation-receipt verified-staging-identity targeted-build targeted-surface-smoke exact-production-candidate targeted-canary verified-production-identity'.split(
    ' '
  ),
  medium:
    'exact-main-ci staging-controller-authorization staging-generation-receipt verified-staging-identity selected-integration exact-production-candidate targeted-canary verified-production-identity'.split(
      ' '
    ),
  high: 'exact-main-ci staging-controller-authorization staging-generation-receipt verified-staging-identity full-selected-evidence exact-production-candidate targeted-canary rollback-proof high-confidence-runtime-proof verified-production-identity'.split(
    ' '
  ),
};
function normalizeRisk(input, expectedSha) {
  const uncertainties = [];
  const riskLevel = input?.risk_level;
  if (!input || typeof input !== 'object')
    uncertainties.push('missing exact_ci_receipt');
  if (!['low', 'medium', 'high'].includes(riskLevel))
    uncertainties.push('unknown exact_ci_receipt risk_level');
  if (expectedSha && input?.sha !== expectedSha)
    uncertainties.push(
      'exact_ci_receipt is not bound to the exact lineage SHA'
    );
  const flag = key => {
    const value = input?.[key];
    if (typeof value === 'boolean') return value;
    uncertainties.push(`unknown exact_ci_receipt ${key}`);
    return true;
  };
  const matched = input?.matched_rule_ids;
  return {
    risk_level: ['low', 'medium', 'high'].includes(riskLevel)
      ? riskLevel
      : 'unknown',
    requires_smoke: flag('requires_smoke'),
    requires_preview: flag('requires_preview'),
    blocks_unattended: flag('blocks_unattended'),
    matched_rule_ids: Array.isArray(matched) ? matched.filter(Boolean) : [],
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

  const risk = normalizeRisk(input.riskReceipt, lineageSha);
  let originalLane = deployableWeb ? risk.risk_level : 'not_applicable';
  if (originalLane === 'unknown') originalLane = 'high';
  let selectedLane = originalLane;
  let overrideReceipt = null;
  if (input.override) {
    const override = input.override;
    if (
      !override.id ||
      !override.actor ||
      !override.reason ||
      !LANES.includes(override.requestedLane)
    )
      throw new Error('invalid override');
    if (WEIGHT[override.requestedLane] < WEIGHT[originalLane])
      throw new Error('override cannot lower the original release lane');
    selectedLane = override.requestedLane;
    overrideReceipt = { ...override, originalLane };
  }

  const requiredProof = [...PROOF[selectedLane]];
  if (risk.requires_smoke && deployableWeb)
    requiredProof.push('risk-required-smoke');
  if (risk.requires_preview && deployableWeb)
    requiredProof.push('risk-required-preview');
  const certificationRequired =
    deployableWeb &&
    selectedLane === 'high' &&
    (risk.blocks_unattended || risk.uncertainties.length > 0);
  const receipt = {
    schema: 'jovie.release-risk-receipt/v1',
    policyVersion: RELEASE_RISK_POLICY_VERSION,
    lineageSha,
    riskInputs: [risk],
    originalClassification: { ...risk, selectedLane: originalLane },
    override: overrideReceipt,
    selectedLane,
    requiredProof,
    evidenceState: certificationRequired ? 'red' : 'pending',
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
    riskInputs: receipt.riskInputs,
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
  const terminal = Date.parse(terminalAt);
  const merge = Date.parse(receipt.latency?.mergeAt);
  if (!Number.isFinite(terminal) || !Number.isFinite(merge) || terminal < merge)
    throw new Error('invalid release latency interval');
  const seconds = Math.round((terminal - merge) / 1000);
  const latency = {
    ...receipt.latency,
    terminalAt: new Date(terminal).toISOString(),
    measuredSeconds: seconds,
    withinTarget: seconds <= receipt.latency.targetP95Seconds,
  };
  const ovie = { ...receipt.ovie, measuredLatencySeconds: seconds };
  const next = { ...receipt, latency, ovie };
  next.evidenceState = receipt.certificationPacket ? 'red' : 'green';
  if (next.certificationPacket)
    next.certificationPacket.evidence = {
      ...next.certificationPacket.evidence,
      ...ovie,
    };
  return next;
}

function arg(args, name) {
  const index = args.indexOf(`--${name}`);
  if (index < 0 || !args[index + 1]) throw new Error(`--${name} is required`);
  return args[index + 1];
}

function writeOutputs(path, receipt) {
  const values = {
    release_lane: receipt.selectedLane,
    release_policy_version: receipt.policyVersion,
    release_target_seconds: receipt.latency.targetP95Seconds,
    release_unattended_allowed: receipt.promotion.unattendedAllowed,
    release_certification_required: receipt.promotion.certificationRequired,
    release_requires_smoke: receipt.originalClassification.requires_smoke,
  };
  writeFileSync(
    path,
    `${Object.entries(values)
      .map(([key, value]) => `${key}=${value}`)
      .join('\n')}\n`,
    { flag: 'a' }
  );
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
    mergeAt: arg(args, 'merge-at'),
  });
  writeFileSync(out, `${JSON.stringify(receipt, null, 2)}\n`);
  if (args.includes('--github-output'))
    writeOutputs(arg(args, 'github-output'), receipt);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href)
  runCli(process.argv.slice(2));
