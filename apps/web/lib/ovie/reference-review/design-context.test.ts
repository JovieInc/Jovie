import { describe, expect, it } from 'vitest';
import {
  scope,
  session,
} from '@/lib/agent-os/design-reference-corpus/adaptive/fixtures.test-utils';
import { referenceDesignContext } from './design-context';

describe('private design-agent reference context', () => {
  it('retrieves a relevant rated reference beyond the screen top25', () => {
    const state = session(51);
    for (const id of Object.keys(state.media)) state.ratings[id] = 5;
    state.corpus.references['ref-026'].reference.pageType = 'homepage';
    const context = referenceDesignContext(state, scope, {
      surface: 'homepage',
    });
    expect(context.references.map(reference => reference.id)).toEqual([
      'ref-026',
    ]);
  });
  it('uses the canonical context builder and preserves unrated provenance without exposing ownership', () => {
    const state = session(3),
      before = JSON.stringify(state);
    const context = referenceDesignContext(state, scope, {
      surface: 'editorial',
    });
    expect(context.references).toHaveLength(3);
    expect(
      context.references.every(reference => reference.rating === null)
    ).toBe(true);
    expect(context.references[0]).toMatchObject({
      sourceUrl: state.media['ref-001'].sourceUrl,
      sha256: state.media['ref-001'].sha256,
      rights: { referenceOnly: true, productionReuse: false },
    });
    expect(context.promptBlock).toContain('References (inspiration only)');
    expect(context.promptBlock).toContain(
      'pixel availability is not established'
    );
    expect(JSON.stringify(context)).not.toContain(scope.tenantId);
    expect(JSON.stringify(state)).toBe(before);
  });
  it('prefers high ratings in this context and excludes low ratings or skipped candidates', () => {
    const state = session(4);
    state.ratings['ref-003'] = 5;
    state.ratings['ref-002'] = 1;
    state.skipped.push('ref-004');
    const context = referenceDesignContext(state, scope, {
      surface: 'editorial',
    });
    expect(context.references.map(reference => reference.id)).toEqual([
      'ref-003',
      'ref-001',
    ]);
    expect(context.references.map(reference => reference.rating)).toEqual([
      5,
      null,
    ]);
    expect(context.promptBlock).toContain(
      'Preference order: ref-003 (5), ref-001 (unrated)'
    );
  });
  it('rejects cross-scope reads and omits unverified, rejected or disallowed previews', () => {
    const state = session(3);
    expect(() =>
      referenceDesignContext(
        state,
        { ...scope, tenantId: 'other' },
        { surface: 'editorial' }
      )
    ).toThrow('scope');
    state.media['ref-001'].verification = 'unverified';
    state.media['ref-002'].rights.previewAllowed = false;
    state.corpus.references['ref-003'].status = 'rejected';
    expect(
      referenceDesignContext(state, scope, { surface: 'editorial' }).references
    ).toEqual([]);
  });
  it('bounds agent context and returns no unrelated sources', () => {
    const state = session(51);
    expect(
      referenceDesignContext(state, scope, { surface: 'editorial' }).references
    ).toHaveLength(5);
    expect(
      referenceDesignContext(state, scope, { surface: 'not-a-match' })
        .references
    ).toEqual([]);
    for (const limit of [0, 6, NaN])
      expect(() =>
        referenceDesignContext(state, scope, { surface: 'editorial', limit })
      ).toThrow();
  });
});
