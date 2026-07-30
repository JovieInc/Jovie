import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { validateOpportunity } from '../../../.claude/skills/brand-deals/scripts/validate-opportunity.mjs';

const skill = readFileSync(
  new URL('../../../.claude/skills/brand-deals/SKILL.md', import.meta.url),
  'utf8'
);
const evidencePolicy = readFileSync(
  new URL(
    '../../../.claude/skills/brand-deals/references/evidence-policy.md',
    import.meta.url
  ),
  'utf8'
);
const commercialGuardrails = readFileSync(
  new URL(
    '../../../.claude/skills/brand-deals/references/commercial-guardrails.md',
    import.meta.url
  ),
  'utf8'
);
const connectorRouting = readFileSync(
  new URL(
    '../../../.claude/skills/brand-deals/references/connector-routing.md',
    import.meta.url
  ),
  'utf8'
);
const timBrandDealCanon = readFileSync(
  new URL(
    '../../../.claude/skills/brand-deals/references/tim-brand-deal-canon.md',
    import.meta.url
  ),
  'utf8'
);

const validOpportunity = {
  title: 'Artie creator-performance campaign',
  buyerName: 'Hayley Delaine',
  buyerCompany: 'Kids in Big Bodies',
  identityMatched: true,
  ownershipVerified: true,
  personalDealVerified: true,
  relationshipType: 'past_personal_deal',
  sourceType: 'personal_email',
  sourceLabel: 'Authenticated personal Gmail',
  sourceAccount: 't@timwhite.co',
  requiredSourceAccount: 't@timwhite.co',
  sourceReference: 'gmail:thread:181696d593400f5c',
  observedAt: '2026-07-29T10:00:00.000Z',
  evidenceStatus: 'verified',
  confidence: 1,
  currency: 'USD',
  rightsSummary: '90-day organic usage, no broad exclusivity',
  budgetMinCents: 750_000,
  budgetMaxCents: 1_000_000,
  depositPercent: 50,
  activeSponsorCampaignCount: 0,
  includedRevisions: 1,
  usageTerm: '90_days',
  usageTermDays: 90,
  exclusivity: 'none',
  routeToLyb: false,
  lybPaidFlowVerified: false,
  externalSendApproved: false,
  commercialApprovalId: null,
  expectedUpfrontCashCents: 500_000,
  closeProbability: 0.6,
  repeatPotential: 1.5,
  creatorMinutes: 60,
};

describe('brand-deals skill contract', () => {
  it('requires connector identity and keeps personal evidence lanes separate', () => {
    expect(skill).toContain('Poll each connector');
    expect(skill).toContain('t@timwhite.co');
    expect(skill).toContain('tim@jov.ie');
    expect(skill).toContain('A7X3');
    expect(skill).toContain('Backstage.com');
    expect(skill).toContain('Backstage.Army');
    expect(skill).toContain('Creator-economy relationships');
    expect(skill).toContain('check Composio');
    expect(skill).toContain('emitBrandDealOpportunity');
    expect(skill).toContain('Never insert a');
  });

  it('polls a Composio fallback and verifies the personal Gmail profile', () => {
    expect(connectorRouting).toContain('composio connections list');
    expect(connectorRouting).toContain(
      'https://gmail.googleapis.com/gmail/v1/users/me/profile'
    );
    expect(connectorRouting).toContain('t@timwhite.co');
    expect(connectorRouting).toContain('case-insensitively');
    expect(connectorRouting).toContain(
      'Never print or persist a Composio API key'
    );
    expect(connectorRouting).toContain(
      "not Jovie's\nproduction runtime contract"
    );
    expect(connectorRouting).toContain('emitBrandDealOpportunity');
  });

  it('anchors Tim-specific strategy in verified personal deal receipts', () => {
    expect(timBrandDealCanon).toContain('Artie via Kids in Big Bodies');
    expect(timBrandDealCanon).toContain('Gmail thread `181696d593400f5c`');
    expect(timBrandDealCanon).toContain('Negotiated campaign fee: $10,000');
    expect(timBrandDealCanon).toContain('Signed contract: yes');
    expect(timBrandDealCanon).toContain('Haptik via Affable');
    expect(timBrandDealCanon).toContain('Fee: not yet verified');
    expect(timBrandDealCanon).toContain('Backstage.Army is unrelated');
    expect(timBrandDealCanon).toContain('No YouTube song');
    expect(timBrandDealCanon).toContain('UC90tJdD38139ytPUdEZVl1A');
    expect(timBrandDealCanon).toContain('Subscribers: 24,100');
    expect(timBrandDealCanon).toContain('Aggregate channel views: 1,869,114');
    expect(timBrandDealCanon).toContain('Instagram was expired in Composio');
  });

  it('requires two approvals and preserves the commercial guardrails', () => {
    expect(skill).toContain('Gate A: buyer approval');
    expect(skill).toContain('Gate B: commercial commitment');
    expect(commercialGuardrails).toContain('50% before activation');
    expect(commercialGuardrails).toContain('one session');
    expect(commercialGuardrails).toContain('one round');
    expect(commercialGuardrails).toContain('Perpetual or irrevocable usage');
    expect(commercialGuardrails).toContain('Unlimited revisions');
    expect(commercialGuardrails).toContain('Broad industry exclusivity');
  });

  it('withdraws disproved claims and creates a regression case', () => {
    expect(evidencePolicy).toContain('Withdraw every buyer-facing artifact');
    expect(evidencePolicy).toContain('Add a deterministic regression case');
    expect(evidencePolicy).toContain('Do not infer ownership');
  });
});

describe('brand-deal opportunity validator', () => {
  it('accepts a verified, fixed-scope opportunity', () => {
    expect(validateOpportunity(validOpportunity)).toEqual({
      valid: true,
      errors: [],
      rankingScore: 75,
    });
  });

  it.each([
    [
      'a creator-economy relationship',
      { relationshipType: 'creator_economy_adjacency' },
      'forbidden_relationship_type:creator_economy_adjacency',
    ],
    [
      'an A7X3 company activation',
      { relationshipType: 'company_activation' },
      'forbidden_relationship_type:company_activation',
    ],
    [
      'the wrong Gmail account',
      { sourceAccount: 'tim@jov.ie' },
      'source_account_mismatch',
    ],
    [
      'Backstage.Army',
      {
        sourceType: 'backstage',
        sourceReference: 'https://backstage.army/opportunity/1',
      },
      'unrelated_backstage_source',
    ],
    [
      'unverified asset ownership',
      { ownershipVerified: false },
      'ownership_not_verified',
    ],
    ['perpetual usage', { usageTermDays: 36_500 }, 'forbidden_usage_term'],
    [
      'unlimited revisions',
      { includedRevisions: 99 },
      'too_many_included_revisions',
    ],
    ['broad exclusivity', { exclusivity: 'broad' }, 'forbidden_exclusivity'],
    [
      'all-category exclusivity',
      { exclusivity: 'all_categories' },
      'forbidden_exclusivity',
    ],
    [
      'a second active campaign',
      { activeSponsorCampaignCount: 1 },
      'active_sponsor_slot_occupied',
    ],
    [
      'LYB before paid-flow proof',
      { routeToLyb: true },
      'lyb_paid_flow_unverified',
    ],
    [
      'an external send without commercial approval',
      { externalSendApproved: true },
      'external_send_not_allowed_at_buyer_gate',
    ],
    [
      'a fake commercial approval receipt at the buyer gate',
      { externalSendApproved: true, commercialApprovalId: 'approval-123' },
      'external_send_not_allowed_at_buyer_gate',
    ],
    [
      'a non-Gmail personal source reference',
      { sourceReference: 'https://example.com/thread/123' },
      'personal_email_source_not_verified',
    ],
    [
      'a low-confidence evidence claim',
      { confidence: 0.5 },
      'evidence_not_verified',
    ],
    [
      'a future observation',
      { observedAt: '2999-01-01T00:00:00.000Z' },
      'observed_at_invalid',
    ],
    ['a non-USD opportunity', { currency: 'EUR' }, 'currency_not_usd'],
    [
      'a missing deposit',
      { depositPercent: undefined },
      'deposit_below_50_percent',
    ],
    [
      'missing revision terms',
      { includedRevisions: undefined },
      'too_many_included_revisions',
    ],
    [
      'missing evidence observation time',
      { observedAt: undefined },
      'observed_at_invalid',
    ],
  ])('rejects %s', (_label, patch, expectedError) => {
    const result = validateOpportunity({ ...validOpportunity, ...patch });
    expect(result.valid).toBe(false);
    expect(result.errors).toContain(expectedError);
  });
});
