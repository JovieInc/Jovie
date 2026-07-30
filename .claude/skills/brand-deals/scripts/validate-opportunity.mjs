#!/usr/bin/env node

import { readFileSync } from 'node:fs';

const PERSONAL_RELATIONSHIP_TYPES = new Set([
  'past_personal_deal',
  'personal_inbound',
  'authenticated_marketplace_match',
  'verified_warm_introduction',
]);

const FORBIDDEN_RELATIONSHIP_TYPES = new Set([
  'company_activation',
  'creator_economy_adjacency',
  'unverified',
]);

const VERIFIED_SOURCE_TYPES = new Set([
  'personal_email',
  'backstage',
  'marketplace',
  'warm_introduction',
]);

function isFiniteNumber(value) {
  return typeof value === 'number' && Number.isFinite(value);
}

function isNonEmptyString(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function isVerifiedBackstageReference(value) {
  if (!isNonEmptyString(value)) return false;
  try {
    const hostname = new URL(value).hostname.toLowerCase();
    return hostname === 'backstage.com' || hostname.endsWith('.backstage.com');
  } catch {
    return false;
  }
}

function isVerifiedPersonalEmailReference(value) {
  return (
    isNonEmptyString(value) &&
    /^gmail:(?:thread|message):[0-9a-f]+$/i.test(value.trim())
  );
}

export function validateOpportunity(input) {
  const errors = [];

  if (!input || typeof input !== 'object') {
    return {
      valid: false,
      errors: ['opportunity_payload_invalid'],
      rankingScore: null,
    };
  }

  if (!isNonEmptyString(input.title)) errors.push('title_missing');
  if (!isNonEmptyString(input.buyerName)) errors.push('buyer_name_missing');
  if (!isNonEmptyString(input.buyerCompany))
    errors.push('buyer_company_missing');
  if (!isNonEmptyString(input.sourceLabel))
    errors.push('source_label_missing');
  if (!isNonEmptyString(input.rightsSummary))
    errors.push('rights_summary_missing');
  if (
    !isNonEmptyString(input.currency) ||
    input.currency.trim().toUpperCase() !== 'USD'
  ) {
    errors.push('currency_not_usd');
  }

  if (input.identityMatched !== true) errors.push('identity_not_matched');
  if (input.ownershipVerified !== true) errors.push('ownership_not_verified');
  if (input.personalDealVerified !== true)
    errors.push('personal_relationship_not_verified');

  if (!PERSONAL_RELATIONSHIP_TYPES.has(input.relationshipType)) {
    errors.push(
      FORBIDDEN_RELATIONSHIP_TYPES.has(input.relationshipType)
        ? `forbidden_relationship_type:${input.relationshipType}`
        : 'invalid_relationship_type'
    );
  }

  if (!VERIFIED_SOURCE_TYPES.has(input.sourceType)) {
    errors.push('source_type_invalid');
  }
  if (!input.sourceAccount || !input.requiredSourceAccount) {
    errors.push('source_account_missing');
  } else if (
    input.sourceAccount.trim().toLowerCase() !==
    input.requiredSourceAccount.trim().toLowerCase()
  ) {
    errors.push('source_account_mismatch');
  }

  if (!isNonEmptyString(input.sourceReference)) {
    errors.push('source_reference_missing');
  } else if (/backstage\.army/i.test(input.sourceReference)) {
    errors.push('unrelated_backstage_source');
  }

  if (
    input.sourceType === 'backstage' &&
    !isVerifiedBackstageReference(input.sourceReference)
  ) {
    errors.push('backstage_source_not_verified');
  }
  if (
    input.sourceType === 'personal_email' &&
    !isVerifiedPersonalEmailReference(input.sourceReference)
  ) {
    errors.push('personal_email_source_not_verified');
  }

  const observedAtMs = Date.parse(input.observedAt);
  if (
    !isNonEmptyString(input.observedAt) ||
    !Number.isFinite(observedAtMs) ||
    observedAtMs > Date.now() + 5 * 60 * 1000
  ) {
    errors.push('observed_at_invalid');
  }
  if (
    input.evidenceStatus !== 'verified' ||
    !isFiniteNumber(input.confidence) ||
    input.confidence < 0.9 ||
    input.confidence > 1
  ) {
    errors.push('evidence_not_verified');
  }

  const budgetMin = input.budgetMinCents;
  const budgetMax = input.budgetMaxCents;
  if (
    !isFiniteNumber(budgetMin) ||
    !isFiniteNumber(budgetMax) ||
    budgetMin < 750_000 ||
    budgetMax > 1_250_000 ||
    budgetMin > budgetMax
  ) {
    errors.push('budget_outside_target');
  }

  if (
    !isFiniteNumber(input.depositPercent) ||
    input.depositPercent < 50 ||
    input.depositPercent > 100
  ) {
    errors.push('deposit_below_50_percent');
  }
  if (
    !Number.isInteger(input.activeSponsorCampaignCount) ||
    input.activeSponsorCampaignCount !== 0
  ) {
    errors.push('active_sponsor_slot_occupied');
  }
  if (
    !Number.isInteger(input.includedRevisions) ||
    input.includedRevisions < 0 ||
    input.includedRevisions > 1
  ) {
    errors.push('too_many_included_revisions');
  }
  if (
    !Number.isInteger(input.usageTermDays) ||
    input.usageTermDays < 1 ||
    input.usageTermDays > 90
  ) {
    errors.push('forbidden_usage_term');
  }
  if (input.exclusivity !== 'none' && input.exclusivity !== 'narrow_paid') {
    errors.push('forbidden_exclusivity');
  }
  if (input.routeToLyb === true && input.lybPaidFlowVerified !== true) {
    errors.push('lyb_paid_flow_unverified');
  }
  if (
    typeof input.routeToLyb !== 'boolean' ||
    typeof input.lybPaidFlowVerified !== 'boolean'
  ) {
    errors.push('lyb_verification_state_missing');
  }
  if (typeof input.externalSendApproved !== 'boolean') {
    errors.push('external_send_state_missing');
  } else if (input.externalSendApproved !== false) {
    errors.push('external_send_not_allowed_at_buyer_gate');
  } else if (input.commercialApprovalId !== null) {
    errors.push('commercial_approval_must_be_null_at_buyer_gate');
  }

  const expectedCash = input.expectedUpfrontCashCents;
  const closeProbability = input.closeProbability;
  const repeatPotential = input.repeatPotential;
  const creatorMinutes = input.creatorMinutes;
  const score =
    isFiniteNumber(expectedCash) &&
    expectedCash >= (budgetMin * input.depositPercent) / 100 &&
    expectedCash <= budgetMax &&
    isFiniteNumber(closeProbability) &&
    closeProbability >= 0 &&
    closeProbability <= 1 &&
    isFiniteNumber(repeatPotential) &&
    repeatPotential >= 0 &&
    isFiniteNumber(creatorMinutes) &&
    creatorMinutes > 0
      ? ((expectedCash / 100) * closeProbability * repeatPotential) /
        creatorMinutes
      : null;

  if (score == null) errors.push('ranking_inputs_invalid');

  return {
    valid: errors.length === 0,
    errors,
    rankingScore: score,
  };
}

function main() {
  const path = process.argv[2];
  if (!path) {
    process.stderr.write(
      'Usage: node validate-opportunity.mjs <opportunity.json>\n'
    );
    process.exitCode = 2;
    return;
  }

  const input = JSON.parse(readFileSync(path, 'utf8'));
  const result = validateOpportunity(input);
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  if (!result.valid) process.exitCode = 1;
}

if (import.meta.url === `file://${process.argv[1]}`) main();
