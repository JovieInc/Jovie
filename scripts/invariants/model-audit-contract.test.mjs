import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  auditCapableModels,
  buildAuditPrompt,
  catalogFingerprint,
  classifyAuditFailure,
  deriveAuditTrigger,
  parseAuditResponse,
  planAuditMatrix,
  probeOutcome,
  proposalRecords,
  validateAuditResult,
  validateLivingInvariantSet,
} from './model-audit-contract.mjs';

const model = (overrides = {}) => ({
  id: 'codex-terra',
  provider: 'codex',
  model: 'gpt-5.6-terra',
  capabilities: ['review', 'architecture'],
  agent_executable_default: 'codex',
  agent_argv: ['exec', '--model', '{model}', '{prompt}'],
  ...overrides,
});

const invariant = (id, key, value) => ({
  id,
  title: id,
  statement: `${id} must remain measurable and directionally explicit.`,
  policy: { key, value },
  effective: { date: '2026-09-01', version: 1 },
  lifecycle: { state: 'adopted' },
});

const livingSet = () => [
  invariant('JOV-INV-023', 'economics.customer-value.direction', {
    direction: 'increase',
  }),
  invariant('JOV-INV-024', 'economics.delivery-unit-cost.direction', {
    direction: 'decrease',
  }),
  invariant('JOV-INV-025', 'economics.contribution-profit.direction', {
    direction: 'increase',
    icp: 'wedge-not-ceiling',
  }),
  invariant('JOV-INV-026', 'invariants.model-audit.cadence', {
    trigger: 'model-catalog-change',
    schedule: 'backstop-only',
    proposals: 'append-only-explicit-supersession-no-canonical-mutation',
  }),
];

const result = (overrides = {}) => ({
  invariantId: 'JOV-INV-023',
  verdict: 'uphold',
  meaningfulness: 'meaningful',
  rationale:
    'The invariant names a measurable outcome and an explicit direction of travel.',
  failureMode: 'Substrate savings fail to improve the customer outcome.',
  metric: 'value per paid account',
  proposal: null,
  supersedesProposalId: null,
  ...overrides,
});

describe('living invariant audit contract', () => {
  it('selects audit-capable models and detects catalog changes', () => {
    const models = [model(), model({ id: 'coder', capabilities: ['code'] })];
    assert.deepEqual(
      auditCapableModels(models).map(item => item.id),
      ['codex-terra']
    );
    assert.notEqual(
      catalogFingerprint(models),
      catalogFingerprint([model({ model: 'gpt-5.7-terra' }), models[1]])
    );
    assert.equal(
      deriveAuditTrigger({
        requestedTrigger: 'scheduled-backstop',
        previousRuns: [{ catalogFingerprint: 'old' }],
        fingerprint: 'new',
      }),
      'model-catalog-change'
    );
  });

  it('keeps the economic directions independent and the ICP open-ended', () => {
    assert.deepEqual(validateLivingInvariantSet(livingSet()), []);
    const collapsed = livingSet();
    collapsed[1].policy.key = 'economics.customer-value.direction';
    assert.match(validateLivingInvariantSet(collapsed).join('\n'), /distinct/);
    const ceiling = livingSet();
    ceiling[2].policy.value.icp = 'ceiling';
    assert.match(validateLivingInvariantSet(ceiling).join('\n'), /wedge/);
  });

  it('plans stale cells and rejects hollow model output', () => {
    const receipt = {
      invariantId: 'JOV-INV-023',
      invariantVersion: 'JOV-INV-023@2026-09-01.1',
      modelId: 'codex-terra',
      provider: 'codex',
      model: 'gpt-5.6-terra',
      auditedAt: '2026-09-01T09:00:00.000Z',
      status: 'completed',
    };
    assert.equal(
      planAuditMatrix({
        invariants: livingSet().slice(0, 1),
        models: [model()],
        receipts: [receipt],
        now: Date.parse('2026-09-01T12:00:00.000Z'),
        ttlMs: 60 * 60 * 1000,
      })[0].state,
      'stale'
    );
    assert.match(
      validateAuditResult(result({ rationale: 'Fine.' }), livingSet()[0]).join(
        '\n'
      ),
      /rationale/
    );
  });

  it('requires structured batches and append-only supersession proposals', () => {
    const parsed = parseAuditResponse(
      `\`\`\`json\n${JSON.stringify({ results: [result()] })}\n\`\`\``
    );
    assert.deepEqual(parsed.results, [result()]);
    assert.match(buildAuditPrompt(livingSet()), /source enforcement truth/i);
    const proposals = proposalRecords({
      runId: 'run-1',
      auditedAt: '2026-09-01T12:00:00.000Z',
      model: model(),
      invariant: livingSet()[0],
      result: result({
        verdict: 'revise',
        proposal: 'Measure successful customer outcomes per paid account.',
        supersedesProposalId: 'proposal-old',
      }),
    });
    assert.equal(proposals[0].supersedesProposalId, 'proposal-old');
    assert.equal(proposals[0].canonicalMutation, false);
  });

  it('requires exact readiness and persists only typed command failures', () => {
    assert.deepEqual(
      probeOutcome(model({ provider: 'grok', model: 'grok-4.6' }), {
        stdout: 'grok-4.5',
      }),
      { available: false, reason: 'model-unlisted' }
    );
    assert.equal(
      classifyAuditFailure({ code: 1, message: 'raw prompt must not persist' }),
      'audit-command-exit-1'
    );
  });
});
