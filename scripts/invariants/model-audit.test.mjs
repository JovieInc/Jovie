import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it } from 'node:test';

import {
  appendAuditRecords,
  auditCapableModels,
  buildAuditPrompt,
  catalogFingerprint,
  classifyAuditFailure,
  deriveAuditTrigger,
  parseArgs,
  parseAuditResponse,
  planAuditMatrix,
  probeOutcome,
  proposalRecords,
  readJsonl,
  runModelAudit,
  validateAuditResult,
  validateLivingInvariantSet,
} from './model-audit.mjs';

const invariant = (id = 'JOV-INV-023', version = 1) => ({
  id,
  title: 'Customer value rises as inputs get cheaper',
  statement: 'Customer value per paid account must rise over time.',
  effective: { date: '2026-09-01', version },
  lifecycle: { state: 'adopted' },
  policy: { key: 'economics.customer-value.direction', value: 'increase' },
});

const model = (overrides = {}) => ({
  id: 'codex-terra',
  provider: 'codex',
  model: 'gpt-5.6-terra',
  channel: 'subscription',
  cost_tier: 'subscription-included',
  capabilities: ['review', 'architecture'],
  agent_executable_default: 'codex',
  agent_argv: ['exec', '--model', '{model}', '{prompt}'],
  probe_argv: ['{executable}', '--version'],
  ...overrides,
});

const result = (overrides = {}) => ({
  invariantId: 'JOV-INV-023',
  verdict: 'uphold',
  meaningfulness: 'meaningful',
  rationale:
    'The rule changes a measurable customer outcome and names the unit of value.',
  failureMode:
    'A cheaper substrate could be retained as margin without improving value.',
  metric: 'customer value delivered per paid account',
  proposal: null,
  supersedesProposalId: null,
  ...overrides,
});

const livingSet = () =>
  [
    invariant(),
    invariant('JOV-INV-024'),
    invariant('JOV-INV-025'),
    invariant('JOV-INV-026'),
  ].map(item => {
    if (item.id === 'JOV-INV-024') {
      item.policy = {
        key: 'economics.delivery-unit-cost.direction',
        value: { direction: 'decrease' },
      };
    } else if (item.id === 'JOV-INV-025') {
      item.policy = {
        key: 'economics.contribution-profit.direction',
        value: { direction: 'increase', icp: 'wedge-not-ceiling' },
      };
    } else if (item.id === 'JOV-INV-026') {
      item.policy = {
        key: 'invariants.model-audit.cadence',
        value: {
          trigger: 'model-catalog-change',
          schedule: 'backstop-only',
          proposals: 'append-only-explicit-supersession-no-canonical-mutation',
        },
      };
    } else {
      item.policy.value = { direction: 'increase' };
    }
    return item;
  });

describe('living invariant model audit', () => {
  it('selects every configured audit-capable model and excludes coding-only models', () => {
    const selected = auditCapableModels([
      model(),
      model({ id: 'kimi-coding', capabilities: ['code', 'tests'] }),
      model({ id: 'grok', capabilities: ['semantic'] }),
    ]);
    assert.deepEqual(
      selected.map(candidate => candidate.id),
      ['codex-terra', 'grok']
    );
  });

  it('changes the catalog fingerprint when model identity or audit capability changes', () => {
    const base = catalogFingerprint([model()]);
    assert.notEqual(
      base,
      catalogFingerprint([model({ model: 'gpt-5.7-terra' })])
    );
    assert.notEqual(
      base,
      catalogFingerprint([model({ capabilities: ['code'] })])
    );
  });

  it('turns model catalog changes into the primary catch-up trigger', () => {
    assert.equal(
      deriveAuditTrigger({
        requestedTrigger: 'scheduled-backstop',
        previousRuns: [{ catalogFingerprint: 'sha256:old' }],
        fingerprint: 'sha256:new',
      }),
      'model-catalog-change'
    );
    assert.equal(
      deriveAuditTrigger({
        requestedTrigger: 'scheduled-backstop',
        previousRuns: [{ catalogFingerprint: 'sha256:same' }],
        fingerprint: 'sha256:same',
      }),
      'scheduled-backstop'
    );
  });

  it('requires exact provider readiness rather than accepting a zero exit alone', () => {
    assert.deepEqual(
      probeOutcome(model({ provider: 'grok', model: 'grok-4.6' }), {
        stdout: 'grok-4.5',
      }),
      { available: false, reason: 'model-unlisted' }
    );
    assert.deepEqual(
      probeOutcome(model({ provider: 'codex' }), { stdout: 'GEM_MODEL_READY' }),
      { available: true, reason: 'ready' }
    );
    assert.equal(
      classifyAuditFailure({
        code: 1,
        message: 'Command failed with a prompt that must never be persisted',
      }),
      'audit-command-exit-1'
    );
    assert.equal(
      classifyAuditFailure({
        killed: true,
        message: 'timed out with raw output',
      }),
      'audit-timeout'
    );
  });

  it('plans the full model by invariant matrix and reopens stale or version-changed cells', () => {
    const now = Date.parse('2026-09-01T12:00:00.000Z');
    const current = {
      schema: 'jovie-invariant-model-audit-receipt/v1',
      receiptId: 'receipt-current',
      invariantId: 'JOV-INV-023',
      invariantVersion: 'JOV-INV-023@2026-09-01.1',
      modelId: 'codex-terra',
      model: 'gpt-5.6-terra',
      provider: 'codex',
      auditedAt: '2026-09-01T11:00:00.000Z',
      status: 'completed',
    };
    assert.equal(
      planAuditMatrix({
        invariants: [invariant()],
        models: [model()],
        receipts: [current],
        now,
        ttlMs: 2 * 60 * 60 * 1000,
      })[0].state,
      'current'
    );
    assert.equal(
      planAuditMatrix({
        invariants: [invariant()],
        models: [model()],
        receipts: [current],
        now: now + 3 * 60 * 60 * 1000,
        ttlMs: 2 * 60 * 60 * 1000,
      })[0].state,
      'stale'
    );
    assert.equal(
      planAuditMatrix({
        invariants: [invariant('JOV-INV-023', 2)],
        models: [model()],
        receipts: [current],
        now,
        ttlMs: 2 * 60 * 60 * 1000,
      })[0].state,
      'missing'
    );
  });

  it('rejects collapsed economic directions or an ICP ceiling', () => {
    assert.deepEqual(validateLivingInvariantSet(livingSet()), []);
    const collapsed = livingSet();
    collapsed[1].policy.key = 'economics.customer-value.direction';
    assert.match(validateLivingInvariantSet(collapsed).join('\n'), /distinct/);
    const ceiling = livingSet();
    ceiling[2].policy.value.icp = 'ceiling';
    assert.match(validateLivingInvariantSet(ceiling).join('\n'), /wedge/);
  });

  it('rejects meaningless or non-specific model output instead of laundering audit completion', () => {
    assert.deepEqual(validateAuditResult(result(), invariant()), []);
    assert.match(
      validateAuditResult(
        result({ meaningfulness: 'hollow', rationale: 'Seems good.' }),
        invariant()
      ).join('\n'),
      /meaningful|rationale/
    );
    assert.match(
      validateAuditResult(result({ failureMode: '' }), invariant()).join('\n'),
      /failureMode/
    );
  });

  it('requires structured JSON for every invariant in a model batch', () => {
    const parsed = parseAuditResponse(
      `analysis before\n\`\`\`json\n${JSON.stringify({ results: [result()] })}\n\`\`\``
    );
    assert.deepEqual(parsed.results, [result()]);
    assert.throws(() => parseAuditResponse('looks fine'), /JSON/);
    assert.match(buildAuditPrompt([invariant()]), /JOV-INV-023/);
    assert.match(buildAuditPrompt([invariant()]), /meaningful/);
    assert.deepEqual(parseArgs(['--', '--trigger', 'catalog-event']), {
      trigger: 'catalog-event',
      maxConcurrency: 2,
      allowPaid: false,
    });
  });

  it('writes append-only receipts and proposals with explicit supersession', () => {
    const root = mkdtempSync(join(tmpdir(), 'jovie-invariant-audit-'));
    const path = join(root, 'receipts.jsonl');
    const records = [
      { schema: 'receipt/v1', receiptId: 'r1' },
      { schema: 'receipt/v1', receiptId: 'r2' },
    ];
    appendAuditRecords(path, records);
    appendAuditRecords(path, [{ schema: 'receipt/v1', receiptId: 'r3' }]);
    assert.deepEqual(
      readFileSync(path, 'utf8')
        .trim()
        .split('\n')
        .map(line => JSON.parse(line).receiptId),
      ['r1', 'r2', 'r3']
    );

    const proposals = proposalRecords({
      runId: 'run-1',
      auditedAt: '2026-09-01T12:00:00.000Z',
      model: model(),
      invariant: invariant(),
      result: result({
        verdict: 'revise',
        proposal:
          'Measure value as successful customer outcomes per paid account.',
        supersedesProposalId: 'proposal-old',
      }),
    });
    assert.equal(proposals.length, 1);
    assert.equal(proposals[0].supersedesProposalId, 'proposal-old');
    assert.equal(proposals[0].canonicalMutation, false);
  });

  it('runs every eligible matrix cell while preserving paid and partial failures', async () => {
    const root = mkdtempSync(join(tmpdir(), 'jovie-invariant-audit-repo-'));
    const storeDir = join(root, 'audit-store');
    mkdirSync(join(root, 'canon'), { recursive: true });
    mkdirSync(join(root, 'scripts', 'hermes', 'config'), { recursive: true });
    writeFileSync(
      join(root, 'canon', 'invariants.jsonl'),
      [
        JSON.stringify({
          schema: 'jovie-invariant-registry/v1',
          version: 'test.1',
          authority: { owner: 'Summer', approvedBy: 'Founder' },
        }),
        ...livingSet().map(item => JSON.stringify(item)),
      ].join('\n')
    );
    writeFileSync(
      join(root, 'scripts', 'hermes', 'config', 'model-registry.json'),
      JSON.stringify({
        models: [
          model({
            probe_argv: [
              '{executable}',
              'exec',
              'Reply with exactly: GEM_MODEL_READY',
            ],
          }),
          model({
            id: 'paid-reviewer',
            provider: 'vercel-ai-gateway',
            model: 'paid/reviewer',
            channel: 'api',
            cost_tier: 'gateway-budgeted-paid',
            probe_argv: ['{executable}', '--help'],
          }),
        ],
      })
    );
    const executeCommand = async (_executable, argv) => {
      if (argv.some(arg => arg.includes('GEM_MODEL_READY'))) {
        return { stdout: 'GEM_MODEL_READY', stderr: '' };
      }
      if (argv.includes('--help')) return { stdout: 'ready', stderr: '' };
      return {
        stdout: JSON.stringify({
          results: livingSet().map(item => result({ invariantId: item.id })),
        }),
        stderr: '',
      };
    };

    const first = await runModelAudit({
      repoRoot: root,
      storeDir,
      trigger: 'scheduled-backstop',
      executeCommand,
      now: Date.parse('2026-09-01T12:00:00.000Z'),
    });
    assert.equal(first.event.plannedCells, 8);
    assert.equal(first.event.completedCells, 4);
    assert.equal(first.event.partialCells, 4);
    assert.deepEqual(
      new Set(first.receipts.map(receipt => receipt.status)),
      new Set(['completed', 'blocked'])
    );
    assert.equal(readJsonl(join(storeDir, 'receipts.jsonl')).length, 8);

    const second = await runModelAudit({
      repoRoot: root,
      storeDir,
      trigger: 'scheduled-backstop',
      executeCommand,
      now: Date.parse('2026-09-01T13:00:00.000Z'),
    });
    assert.equal(second.event.plannedCells, 4);
    assert.equal(second.event.completedCells, 0);
    assert.equal(second.event.partialCells, 4);
    assert.equal(second.event.trigger, 'scheduled-backstop');
  });
});
