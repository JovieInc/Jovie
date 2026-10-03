import { describe, expect, it } from 'vitest';
import type { OvieCertificationInventory } from './certifications/types';
import { inboxDecisionRequest, projectOvieInbox } from './inbox';
import type { SummerCard } from './summer-cards';

const inventory: OvieCertificationInventory = {
  contract: 'jovie.ovie-certification-inventory/v1',
  generatedAt: '2026-10-02T10:00:00Z',
  universal: false,
  domains: [],
  rows: [],
  issues: [],
  counts: {
    total: 0,
    working: 0,
    review_ready: 0,
    founder_locked: 0,
    shipped: 0,
    monitored: 0,
  },
  queue: {
    contract: 'jovie.certification-inbox/v1',
    needsYou: [],
    blocked: [],
    stale: [],
    returned: [],
    certified: [],
    superseded: [],
  },
};
const card: SummerCard = {
  id: 'sc_1',
  idempotencyKey: 'card-key',
  kind: 'spend',
  product: 'company',
  title: 'Review purchase',
  body: 'Buy service',
  recommendation: 'Use existing capacity',
  defaultIfSilent: 'Do not spend',
  recipient: 'Vendor',
  amountUsd: 25,
  evidence: ['https://example.com/receipt'],
  status: 'pending',
  comment: null,
  createdAt: inventory.generatedAt,
  decidedAt: null,
};

describe('Ovie inbox projection', () => {
  it('keeps pending actions with original evidence and authority targets', () => {
    const result = projectOvieInbox(
      [],
      [card, { ...card, id: 'done', status: 'approved' }],
      inventory
    );
    expect(result.cases).toHaveLength(1);
    expect(result.cases[0]).toMatchObject({
      id: 'summer-card:sc_1',
      kind: 'spend',
      decisionTarget: { kind: 'summer', id: 'sc_1' },
      evidence: card.evidence,
    });
    expect(result.cases[0]?.body).toContain('USD 25');
  });
  it('preserves source failures rather than claiming complete coverage', () => {
    expect(
      projectOvieInbox([], [], {
        ...inventory,
        issues: [{ domain: null, source: 'store', message: 'Unavailable' }],
      }).issues
    ).toEqual(['Unavailable']);
  });
  it('routes approval to the existing API without claiming execution', () => {
    expect(
      inboxDecisionRequest(
        { kind: 'summer', id: 'sc_1' },
        'approve',
        '',
        'action'
      )
    ).toEqual({
      url: '/api/ovie/summer-cards/sc_1/decision',
      body: { decision: 'approve', comment: undefined },
    });
  });
  it('binds certification decisions to exact evidence and action IDs', () => {
    const request = inboxDecisionRequest(
      { kind: 'certification', id: 'row', evidenceDigest: 'digest' },
      'modify',
      'Fix copy',
      'action'
    );
    expect(request.body).toMatchObject({
      evidenceDigest: 'digest',
      actionId: 'action',
      decision: 'changes_requested',
      notes: 'Fix copy',
    });
  });
  it('requires rejection rationale and preserves design review day buckets', () => {
    expect(() =>
      inboxDecisionRequest({ kind: 'summer', id: 'sc_1' }, 'reject', '', 'a')
    ).toThrow('reason');
    expect(
      inboxDecisionRequest(
        { kind: 'design', id: 'proposal', dayBucket: '2026-10-02' },
        'reject',
        'Different direction',
        'a'
      ).body
    ).toMatchObject({
      dayBucket: '2026-10-02',
      decision: 'no',
      notes: 'Different direction',
    });
    expect(() =>
      inboxDecisionRequest(
        { kind: 'summer', id: 'sc_1' },
        'modify',
        'Fix copy',
        'a'
      )
    ).toThrow('rejecting');
  });
});

describe('Inbox coverage and producer adapters', () => {
  it('makes disconnected domains explicit', () => {
    const result = projectOvieInbox([], [], {
      ...inventory,
      domains: [
        {
          domain: 'customers',
          label: 'Customers',
          status: 'not_connected',
          rowCount: 0,
          note: 'Inventory unavailable',
        },
      ],
    });
    expect(result.issues).toEqual(['Customers: Inventory unavailable']);
  });
  it.each([0, 1])(
    'preserves work priority %i and completion semantics',
    priority => {
      const result = projectOvieInbox([], [card], inventory, [], {
        issues: [
          {
            id: 'issue',
            identifier: 'JOV-1',
            title: 'Urgent review',
            url: 'https://example.com/issue',
            priority,
            priorityLabel: priority ? 'Urgent' : 'None',
            createdAt: '2026-10-01T00:00:00Z',
            daysOld: 1,
            stateType: 'started',
          },
        ],
        fetchedAt: inventory.generatedAt,
        available: true,
        observation: 'ok',
        errorMessage: null,
      });
      expect(
        result.cases.find(item => item.id === 'linear:issue')?.priority
      ).toBe(priority || 5);
      expect(result.cases[0]?.id).toBe(
        priority ? 'linear:issue' : 'summer-card:sc_1'
      );
      expect(
        inboxDecisionRequest(
          { kind: 'linear', id: 'issue' },
          'approve',
          '',
          'a'
        )
      ).toEqual({
        url: '/api/admin/hud/tim-actions',
        body: { issueId: 'issue' },
      });
      expect(() =>
        inboxDecisionRequest(
          { kind: 'linear', id: 'issue' },
          'reject',
          'no',
          'a'
        )
      ).toThrow('linked work');
    }
  );
  it('retains exact run and surface for screenshot review', () => {
    expect(
      inboxDecisionRequest(
        { kind: 'visual', id: 'run', surfaceId: 'surface' },
        'reject',
        'Wrong layout',
        'a'
      )
    ).toEqual({
      url: '/api/admin/hud/visual-qa/run/review',
      body: {
        surfaceId: 'surface',
        decision: 'rejected',
        notes: 'Wrong layout',
      },
    });
  });
});

describe('Certification Inbox convergence', () => {
  it('keeps canonical evidence and excludes superseded or unactionable revisions', () => {
    const subject = { id: 'subject', kind: 'flow', title: 'Signup' };
    const row: OvieCertificationInventory['rows'][number] = {
      id: 'flows:subject',
      domain: 'flows',
      surface: 'Signup',
      subject,
      state: 'review_ready',
      tiers: {
        canonical_source: 'passed',
        invariant_evaluation: 'passed',
        tests_coverage: 'passed',
        visual_proof: 'passed',
        canonical_references: 'passed',
        required_variants: 'passed',
        ci: 'passed',
        queue_merge: 'passed',
        deploy: 'passed',
        runtime_dogfood: 'passed',
      },
      evidence: [
        {
          id: 'proof',
          tier: 'visual_proof',
          status: 'passed',
          summary: 'Desktop and mobile verified',
          href: 'https://example.com/proof',
          ref: 'proof:1',
        },
      ],
      blockers: [],
      staleFounderLock: false,
      updatedAt: inventory.generatedAt,
      links: [],
      history: [],
      decision: { available: true, reason: null, evidenceDigest: 'current' },
      source: null,
    };
    const queueItem: OvieCertificationInventory['queue']['needsYou'][number] = {
      contract: 'jovie.certification-inbox/v1',
      domain: 'flows',
      subject,
      state: 'review_ready',
      bucket: 'needs_you',
      decisionEvidenceDigest: 'current',
      decisionScore: 1,
      estimatedFounderMinutes: 1,
      requestedDecision: 'Certify',
      lastDecision: null,
      staleFounderLock: false,
      blockers: [],
      actions: ['certify'],
      observedAt: inventory.generatedAt,
    };
    const source = {
      ...inventory,
      rows: [
        {
          ...row,
          id: 'old',
          decision: { ...row.decision, evidenceDigest: 'old' },
        },
        row,
      ],
      queue: { ...inventory.queue, needsYou: [queueItem] },
    };
    const result = projectOvieInbox([], [], source);
    expect(result.cases).toHaveLength(1);
    expect(result.cases[0]?.evidence).toEqual(['https://example.com/proof']);
    expect(result.cases[0]?.body).toContain('Desktop and mobile verified');
    const blocked = projectOvieInbox([], [card], {
      ...source,
      rows: [{ ...row, decision: { ...row.decision, available: false } }],
    });
    expect(blocked.cases.map(item => item.id)).toEqual(['summer-card:sc_1']);
    expect(blocked.issues).toContain(
      'Signup: additional evidence is required.'
    );
  });
});

it('omits optional visual notes on approval', () => {
  expect(
    inboxDecisionRequest(
      { kind: 'visual', id: 'run', surfaceId: 'surface' },
      'approve',
      '',
      'a'
    ).body
  ).toEqual({ surfaceId: 'surface', decision: 'accepted', notes: undefined });
});
