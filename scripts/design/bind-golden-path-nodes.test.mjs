import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  applyBindings,
  BIND_SECTIONS,
  parseSetArgs,
  validateNodeId,
} from './bind-golden-path-nodes.mjs';

const base = {
  schema: 'pen-still-manifest/v1',
  frames: BIND_SECTIONS.map(sectionId => ({
    sectionId,
    penNodeId: 'pending-no-design',
    route: '/',
    status: 'active',
  })),
};

describe('bind-golden-path-nodes', () => {
  it('rejects pending, empty, and malformed ids', () => {
    assert.ok(validateNodeId('pending-no-design'));
    assert.ok(validateNodeId(''));
    assert.ok(validateNodeId('not a node'));
    assert.equal(validateNodeId('D9kdx'), null);
  });

  it('binds allowlisted sections and refuses others', () => {
    const ok = applyBindings(
      structuredClone(base),
      new Map([
        ['landing/homepage', 'Ab12c'],
        ['claim/claim', 'Xy90z'],
        ['checkout/billing-success', 'Qq11a'],
      ])
    );
    assert.equal(ok.ok, true);
    assert.equal(ok.applied.length, 3);
    assert.equal(
      ok.manifest.frames.find(f => f.sectionId === 'landing/homepage')
        .penNodeId,
      'Ab12c'
    );

    const bad = applyBindings(
      structuredClone(base),
      new Map([
        ['landing/homepage', 'pending-x'],
        ['smartlink/release', 'Ab12c'],
      ])
    );
    assert.equal(bad.ok, false);
    assert.ok(bad.blockers.some(b => b.code === 'pen_node_id'));
    assert.ok(bad.blockers.some(b => b.code === 'section_not_allowed'));
  });

  it('parses --set pairs', () => {
    const { sets, dryRun } = parseSetArgs([
      '--set',
      'landing/homepage=Ab12c',
      '--dry-run',
    ]);
    assert.equal(dryRun, true);
    assert.equal(sets.get('landing/homepage'), 'Ab12c');
  });
});
