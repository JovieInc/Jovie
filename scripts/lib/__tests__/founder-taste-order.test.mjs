import { describe, expect, it } from 'vitest';

// The JOV-7703 contract is TypeScript in another package; load it at runtime
// so the scripts checkJs pass does not typecheck that package.
const CONTRACTS = new URL(
  '../../../packages/agent-transport-contracts',
  import.meta.url
).href;
const {
  acknowledgeDispatch,
  extractWorkBlocks,
  renderWorkBlock,
  sealWorkOrder,
} = await import(`${CONTRACTS}/work-order.ts`);
const { founderCardKey, fromSummerCard, toSummerCard } = await import(
  `${CONTRACTS}/work-order-adapters.ts`
);

import {
  founderTasteOrder,
  readTasteOrders,
  renderTasteOrder,
  tasteReceiptsFromResults,
} from '../founder-taste-order.mjs';

const BINDING = '1'.repeat(40);
const BUILD = '3'.repeat(40);
const NOW = '2026-10-04T01:00:00.000Z';

function order(overrides = {}) {
  return founderTasteOrder({
    identifier: 'jov-1',
    issueTitle: 'Rail toggle mirrors the left rail',
    issueUrl: 'https://linear.app/jovie/issue/JOV-1',
    bindingSha: BINDING,
    bindingPull: 'https://github.com/JovieInc/Jovie/pull/101',
    deploymentSha: BUILD,
    productionUrl: 'https://jov.ie',
    uiEvidence: [
      {
        row: 'AM-020',
        failureClass: 'ui-interaction-state-machine',
        targets: ['web-chromium', 'macos-electron'],
      },
    ],
    reason: 'UI change invalidates AM-020',
    now: NOW,
    ...overrides,
  });
}

/** Summer's JOV-7739 path: card, acknowledge, then the decided result. */
function summerDecides(sealed, status, comment = null) {
  const card = {
    id: 'card-1',
    idempotencyKey: founderCardKey(sealed),
    status,
    comment,
    decidedAt: status === 'pending' ? null : '2026-10-04T02:00:00.000Z',
  };
  const ack = acknowledgeDispatch(sealed, {
    transportRef: `ovie:summer-card/${card.id}`,
    dispatchedAt: '2026-10-04T01:30:00.000Z',
  });
  return {
    ack,
    result: fromSummerCard(sealed, {
      ack,
      card,
      observedAt: card.decidedAt ?? '2026-10-04T01:30:00.000Z',
    }),
  };
}

const commentsFor = (...records) =>
  records.map((record, index) => ({
    body: `Founder decision\n\n${renderWorkBlock(record)}`,
    createdAt: `2026-10-04T02:0${index}:00.000Z`,
  }));

describe('founder taste work order (JOV-7759 x JOV-7703)', () => {
  it('seals byte for byte with the contract and routes to an Ovie taste card', () => {
    const filed = order();
    const sealed = sealWorkOrder(filed);
    expect(sealed.digest).toBe(filed.digest);
    const card = toSummerCard(sealed, { priorResults: [] });
    expect(card.kind).toBe('taste');
    expect(card.title).toBe(
      'Taste JOV-1 @ 333333333333: Rail toggle mirrors the left rail'
    );
    expect(card.evidence).toContain('https://jov.ie');
    const body = `Intro\n\n${renderTasteOrder(filed)}`;
    expect(extractWorkBlocks(body).orders).toHaveLength(1);
    expect(body).toContain(
      renderWorkBlock(sealed).split('\n')[0] // the contract's dispatch marker
    );
    expect(
      sealWorkOrder(order({ issueTitle: 'x'.repeat(300) })).title
    ).toHaveLength(120);
  });

  it('reads an approval as a pass on the exact build, and a rejection as a fail with the note', () => {
    const filed = order();
    const description = renderTasteOrder(filed);
    const sealed = sealWorkOrder(filed);
    const approved = summerDecides(sealed, 'approved');
    expect(
      tasteReceiptsFromResults(
        description,
        commentsFor(approved.ack, approved.result),
        'JOV-1'
      )
    ).toEqual([
      {
        kind: 'founder-taste',
        status: 'pass',
        sha: BUILD,
        evidence: 'ovie:summer-card/card-1',
        recordedAt: '2026-10-04T02:01:00.000Z',
      },
    ]);
    const rejected = summerDecides(
      sealed,
      'rejected',
      'The toggle still jumps on open.'
    );
    expect(
      tasteReceiptsFromResults(
        description,
        commentsFor(rejected.result),
        'JOV-1'
      )[0]
    ).toMatchObject({
      status: 'fail',
      sha: BUILD,
      note: 'The toggle still jumps on open.',
    });
    const pending = summerDecides(sealed, 'pending');
    expect(
      tasteReceiptsFromResults(
        description,
        commentsFor(pending.ack, pending.result),
        'JOV-1'
      )
    ).toEqual([]);
  });

  it('accepts on silence past the deadline, and a founder decision still wins', () => {
    const filed = order();
    expect(filed.founderAsk.defaultIfSilent).toMatch(/^Accept at the deadline/);
    const description = renderTasteOrder(filed);
    const deadline = filed.budget.deadline;
    const before = new Date(Date.parse(deadline) - 1000).toISOString();
    const after = new Date(Date.parse(deadline) + 1000).toISOString();
    // Inside the deadline, silence is not a decision.
    expect(
      tasteReceiptsFromResults(description, [], 'JOV-1', undefined, before)
    ).toEqual([]);
    // Past it, the default accepts the exact build, recorded at the deadline.
    expect(
      tasteReceiptsFromResults(description, [], 'JOV-1', undefined, after)
    ).toEqual([
      {
        kind: 'founder-taste',
        status: 'pass',
        sha: BUILD,
        evidence: `default-if-silent: no founder decision on ${filed.orderId} by its deadline ${deadline}`,
        recordedAt: new Date(Date.parse(deadline)).toISOString(),
      },
    ]);
    // A founder rejection is never overridden by the default.
    const rejected = summerDecides(sealWorkOrder(filed), 'rejected', 'No.');
    expect(
      tasteReceiptsFromResults(
        description,
        commentsFor(rejected.result),
        'JOV-1',
        undefined,
        after
      )
    ).toEqual([expect.objectContaining({ status: 'fail', note: 'No.' })]);
  });

  it('ignores results for an edited order, another issue, or another revision', () => {
    const filed = order();
    const sealed = sealWorkOrder(filed);
    const { result } = summerDecides(sealed, 'approved');
    const forgedBuild = renderTasteOrder({
      ...filed,
      scope: { ...filed.scope, entityRefs: ['JOV-1', `sha:${'9'.repeat(40)}`] },
    });
    expect(readTasteOrders(forgedBuild, 'JOV-1')).toEqual([]);
    expect(
      tasteReceiptsFromResults(forgedBuild, commentsFor(result), 'JOV-1')
    ).toEqual([]);
    expect(
      tasteReceiptsFromResults(
        renderTasteOrder(filed),
        commentsFor(result),
        'JOV-2'
      )
    ).toEqual([]);
    expect(
      tasteReceiptsFromResults(
        renderTasteOrder(filed),
        commentsFor({ ...result, orderDigest: 'f'.repeat(64) }),
        'JOV-1'
      )
    ).toEqual([]);
    expect(
      tasteReceiptsFromResults(
        renderTasteOrder(filed),
        [{ body: renderWorkBlock(result), createdAt: 'not a time' }],
        'JOV-1'
      )
    ).toEqual([]);
  });
});
