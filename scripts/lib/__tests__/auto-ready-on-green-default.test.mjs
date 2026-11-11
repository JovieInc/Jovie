import { describe, expect, it } from 'vitest';
import { classifyGreenSourceDraft } from '../auto-ready-green-drafts.mjs';
import {
  classifyAutoReadyPromotion,
  hasOnGreenOptIn,
  hasParkMarker,
  ON_GREEN_WRITERS,
  PARK_MARKER,
} from '../auto-ready-provenance.mjs';

// Tim, Nov 11 2026: "all prs must merge automatically on green". A trusted
// writer's draft ships on green unless it parks; every other gate stays.
const head = 'd'.repeat(40);
const park = `<!-- ${PARK_MARKER} -->`;
const onGreen = '<!-- jovie-auto-ready: on-green -->';
const restBody = 'Before: opened through the REST API.\n\nAfter: ships.';

function greenDraft(overrides = {}) {
  return {
    prNumber: 25100,
    state: 'OPEN',
    draft: true,
    baseRefName: 'main',
    headSha: head,
    mergeable: 'MERGEABLE',
    mergeStateStatus: 'CLEAN',
    labels: [],
    title: 'fix(queue): ship on green',
    branch: 'fix/ship-on-green-default',
    checks: [
      { name: 'PR Ready', bucket: 'pass', state: 'SUCCESS' },
      { name: 'Migration Guard', bucket: 'pass', state: 'SUCCESS' },
      { name: 'Fork PR Gate', bucket: 'pass', state: 'SUCCESS' },
      { name: 'PR Size Guard', bucket: 'pass', state: 'SUCCESS' },
      { name: 'Company guards', bucket: 'pass', state: 'SUCCESS' },
    ],
    authorLogin: 'itstimwhite',
    body: restBody,
    ...overrides,
  };
}

const promote = (overrides = {}) =>
  classifyAutoReadyPromotion({
    authorLogin: 'itstimwhite',
    body: restBody,
    headSha: head,
    prNumber: 25100,
    greenSource: true,
    ...overrides,
  });

describe('ship on green by default', () => {
  it('treats a trusted writer draft without the marker as opted in', () => {
    expect(promote()).toEqual({
      eligible: true,
      reason: 'writer-on-green-default',
    });
    for (const authorLogin of ON_GREEN_WRITERS) {
      expect(hasOnGreenOptIn({ authorLogin, body: restBody })).toBe(true);
    }
    expect(classifyGreenSourceDraft(greenDraft())).toEqual({
      eligible: true,
      reason: 'green-source-clean',
    });
  });

  it('keeps the explicit marker working and naming itself', () => {
    expect(promote({ body: `${restBody}\n\n${onGreen}\n` })).toEqual({
      eligible: true,
      reason: 'writer-on-green-opt-in',
    });
  });

  it('keeps a parked draft a draft, over the marker and over a receipt', () => {
    expect(hasParkMarker(`WIP\n\n${park}`)).toBe(true);
    expect(hasParkMarker('<!--jovie-auto-ready:PARK-->')).toBe(true);
    expect(hasParkMarker(restBody)).toBe(false);
    expect(promote({ body: `${restBody}\n\n${park}` })).toEqual({
      eligible: false,
      reason: 'writer-parked',
    });
    expect(promote({ body: `${onGreen}\n${park}` })).toEqual({
      eligible: false,
      reason: 'writer-parked',
    });
    expect(
      classifyGreenSourceDraft(greenDraft({ body: `${restBody}\n${park}` }))
    ).toEqual({ eligible: false, reason: 'writer-parked' });
  });

  it('never ships an untrusted author without a receipt', () => {
    for (const authorLogin of ['outside-contributor', 'dependabot[bot]', '']) {
      expect(hasOnGreenOptIn({ authorLogin, body: onGreen })).toBe(false);
      expect(promote({ authorLogin, body: onGreen }).eligible).toBe(false);
    }
    expect(
      classifyGreenSourceDraft(greenDraft({ authorLogin: 'a-stranger' }))
    ).toEqual({ eligible: false, reason: 'writer-proof-proof-missing' });
  });

  it('keeps every other gate exactly as it was', () => {
    // The writer-proof path readies drafts with checks pending: no default.
    expect(promote({ greenSource: false })).toEqual({
      eligible: false,
      reason: 'writer-proof-proof-missing',
    });
    const refused = (overrides, reason) =>
      expect(classifyGreenSourceDraft(greenDraft(overrides))).toEqual({
        eligible: false,
        reason,
      });
    refused({ labels: ['hold'] }, 'held');
    refused({ parkedDraft: true }, 'parked-draft');
    refused({ title: '[canary] stay red' }, 'controlled-proof');
    refused({ baseRefName: 'feat/parent' }, 'base:feat/parent');
    refused({ expectedHeadSha: 'e'.repeat(40) }, 'moved-head');
    refused({ draft: false }, 'not-draft');
    refused({ mergeable: 'CONFLICTING' }, 'mergeable:CONFLICTING');
    refused({ mergeStateStatus: 'BLOCKED' }, 'mergeStateStatus:BLOCKED');
    const red = greenDraft().checks.map(c =>
      c.name === 'PR Ready' ? { ...c, bucket: 'fail', state: 'FAILURE' } : c
    );
    const verdict = classifyGreenSourceDraft(greenDraft({ checks: red }));
    expect(verdict.eligible).toBe(false);
    expect(verdict.reason).toMatch(/^checks:.*PR Ready/);
  });
});
