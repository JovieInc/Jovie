import { describe, expect, it } from 'vitest';
import {
  applyReferenceClassification,
  applyReferenceCommand,
  createReferenceSession,
  importReferenceCandidates,
  referenceEligibleIds,
  referencePreferenceTerms,
  referenceScopeKey,
  referenceUrlIdentity,
  referenceView,
} from './engine';
import { candidate, command, now, scope, session } from './fixtures.test-utils';
import {
  MediaAnchorSchema,
  ReferenceIntakeSchema,
  ReferenceSessionSchema,
} from './types';

describe('adaptive reference review', () => {
  it('admits only reference IDs that rating and skip commands can address', () => {
    const state = session(1),
      source = candidate(2);
    for (const id of [
      'room study',
      'a'.repeat(101),
      '__proto__',
      'constructor',
      'toString',
    ]) {
      const invalid = { ...source, reference: { ...source.reference, id } };
      expect(ReferenceIntakeSchema.safeParse(invalid).success).toBe(false);
      expect(() =>
        importReferenceCandidates(state, scope, [invalid], now)
      ).toThrow();
      const parsed = ReferenceSessionSchema.safeParse({
        ...state,
        media: { ...state.media, [id]: source.media },
      });
      expect(parsed.success && Object.hasOwn(parsed.data.media, id)).toBe(
        false
      );
    }
    expect(Object.keys(state.media)).toHaveLength(1);
  });
  it('shares full scoped eligibility without UI truncation', () => {
    const state = session(51);
    expect(referenceEligibleIds(state, scope)).toHaveLength(51);
    expect(() =>
      referenceEligibleIds(state, { ...scope, tenantId: 'other' })
    ).toThrow('scope');
    state.media['ref-001'].verification = 'unverified';
    state.media['ref-002'].rights.previewAllowed = false;
    state.corpus.references['ref-003'].status = 'rejected';
    expect(referenceEligibleIds(state, scope)).toHaveLength(48);
  });
  it('counts only new references against capacity while preserving bounded input and immutable IDs', () => {
    let full = createReferenceSession(scope, now);
    for (let offset = 0; offset < 500; offset += 100)
      full = importReferenceCandidates(
        full,
        scope,
        Array.from({ length: 100 }, (_, i) => candidate(offset + i + 1)),
        now
      );
    const replay = importReferenceCandidates(
      full,
      scope,
      [candidate(500)],
      now
    );
    expect(Object.keys(replay.media)).toHaveLength(500);
    const duplicate = candidate(501, {
      ...candidate(500).media,
      sourceUrl: candidate(501).media.sourceUrl,
    });
    expect(
      Object.keys(
        importReferenceCandidates(full, scope, [duplicate], now).media
      )
    ).toHaveLength(500);
    expect(() =>
      importReferenceCandidates(full, scope, [candidate(501)], now)
    ).toThrow('limit');
    expect(() =>
      importReferenceCandidates(
        full,
        scope,
        Array.from({ length: 101 }, () => candidate(500)),
        now
      )
    ).toThrow('limit');
    expect(() =>
      importReferenceCandidates(
        full,
        scope,
        [candidate(500, { credit: 'changed' })],
        now
      )
    ).toThrow('already exists');
    expect(Object.keys(full.media)).toHaveLength(500);
  });
  it('rejects prototype-property command IDs and independently caps the feedback journal', () => {
    const s = session(1),
      c = command(s, { type: 'rate', referenceId: s.batch.ids[0], rating: 5 });
    for (const commandId of [
      '__proto__',
      'constructor',
      'prototype',
      'toString',
    ])
      expect(() =>
        applyReferenceCommand(s, scope, { ...c, commandId })
      ).toThrow('Reserved identifier');
    const capped = {
      ...s,
      feedback: Array.from({ length: 5000 }, (_, i) => ({
        commandId: `past-${i}`,
        revision: i + 1,
        action: c.action,
        recordedAt: now,
      })),
    };
    expect(() => applyReferenceCommand(capped, scope, c)).toThrow(
      'command limit'
    );
    expect(s.ratings).toEqual({});
  });
  it('accepts newer pixel-bound model proposals while preserving a corrected human cluster', () => {
    let s = session(1),
      id = s.batch.ids[0];
    s = applyReferenceCommand(
      s,
      scope,
      command(s, {
        type: 'create-cluster',
        clusterId: 'room',
        label: 'Room study',
      })
    );
    s = applyReferenceCommand(
      s,
      scope,
      command(s, { type: 'cluster', referenceId: id, clusterId: 'room' })
    );
    const c = {
      ...s.media[id].classification!,
      category: 'locations',
      version: 2,
    };
    const classified = applyReferenceClassification(s, scope, id, c);
    expect(classified.media[id].clusterId).toBe('room');
    expect(classified.media[id].classification?.category).toBe('locations');
    expect(
      applyReferenceClassification(classified, scope, id, { ...c, version: 1 })
    ).toBe(classified);
    expect(
      applyReferenceClassification(classified, scope, id, {
        ...c,
        version: 3,
        inputSha256: 'f'.repeat(64),
      })
    ).toBe(classified);
  });
  it('keeps 25 stable IDs across reload and advances once at the boundary without duplicates', () => {
    let s = session();
    const first = [...s.batch.ids];
    expect(first).toHaveLength(25);
    for (const id of first.slice(0, 24))
      s = applyReferenceCommand(
        s,
        scope,
        command(s, { type: 'rate', referenceId: id, rating: 4 })
      );
    expect(s.batch.ids).toEqual(first);
    expect(
      referenceView(
        ReferenceSessionSchema.parse(JSON.parse(JSON.stringify(s))),
        scope
      ).items.map(i => i.id)
    ).toEqual([first[24]]);
    s = applyReferenceCommand(
      s,
      scope,
      command(s, { type: 'rate', referenceId: first[24], rating: 5 })
    );
    expect(s.batch.number).toBe(2);
    expect(s.batch.ids).toHaveLength(25);
    expect(s.batch.ids.some(id => first.includes(id))).toBe(false);
    expect(referenceView(s, scope).ratedCount).toBe(25);
    expect(s.corpus.references[first[0]].status).toBe('proposed');
    expect(s.corpus.references[first[0]].founderDecision).toBeNull();
  });
  it('undoes a boundary rating back into its original position, then resumes the same next batch', () => {
    let s = session(26);
    for (const id of s.batch.ids)
      s = applyReferenceCommand(
        s,
        scope,
        command(s, { type: 'rate', referenceId: id, rating: 3 })
      );
    const second = [...s.batch.ids];
    const undone = s.undo?.referenceId;
    s = applyReferenceCommand(s, scope, command(s, { type: 'undo' }));
    expect(referenceView(s, scope).items.map(i => i.id)).toEqual([undone]);
    s = applyReferenceCommand(
      s,
      scope,
      command(s, { type: 'rate', referenceId: undone as string, rating: 3 })
    );
    expect(s.batch.ids).toEqual(second);
  });
  it('skips without a fabricated rating and undo restores it', () => {
    let s = session(1);
    s = applyReferenceCommand(
      s,
      scope,
      command(s, { type: 'skip', referenceId: s.batch.ids[0] })
    );
    expect(referenceView(s, scope).items).toHaveLength(0);
    expect(s.ratings).toEqual({});
    s = applyReferenceCommand(s, scope, command(s, { type: 'undo' }));
    expect(referenceView(s, scope).items).toHaveLength(1);
  });
  it('replays identical commands, rejects reusing IDs or stale and duplicate ratings', () => {
    const s = session();
    const c = command(s, {
      type: 'rate',
      referenceId: s.batch.ids[0],
      rating: 5,
    });
    const next = applyReferenceCommand(s, scope, c);
    expect(applyReferenceCommand(next, scope, c)).toBe(next);
    expect(next.feedback).toHaveLength(1);
    expect(next.feedback[0]).toMatchObject({
      commandId: c.commandId,
      action: c.action,
      revision: next.revision,
    });
    expect(Number.isFinite(Date.parse(next.feedback[0].recordedAt))).toBe(true);
    expect(() =>
      applyReferenceCommand(next, scope, {
        ...c,
        action: { type: 'undo' },
      })
    ).toThrow('Command ID reused');
    expect(() =>
      applyReferenceCommand(next, scope, { ...c, commandId: 'other' })
    ).toThrow('Reload');
    expect(() =>
      applyReferenceCommand(
        next,
        scope,
        command(next, { type: 'rate', referenceId: s.batch.ids[0], rating: 1 })
      )
    ).toThrow('active batch');
    expect(() =>
      applyReferenceCommand(
        s,
        scope,
        command(s, { type: 'rate', referenceId: s.batch.ids[0], rating: 6 })
      )
    ).toThrow();
  });
  it('isolates tenant, actor, context and branch on every projection and mutation', () => {
    const s = session();
    for (const key of [
      'tenantId',
      'actorId',
      'contextId',
      'branchId',
    ] as const) {
      const other = { ...scope, [key]: 'other' };
      expect(referenceScopeKey(other)).not.toBe(referenceScopeKey(scope));
      expect(() => referenceView(s, other)).toThrow('scope');
      expect(() => referencePreferenceTerms(s, other)).toThrow('scope');
      expect(() =>
        applyReferenceCommand(s, other, command(s, { type: 'undo' }))
      ).toThrow('scope');
      expect(() => importReferenceCandidates(s, other, [], now)).toThrow(
        'scope'
      );
    }
  });
  it('dedupes image content and media identity while preserving YouTube IDs and frame anchors', () => {
    expect(
      referenceUrlIdentity('https://www.youtube.com/watch?v=alpha&utm_source=a')
    ).not.toBe(referenceUrlIdentity('https://www.youtube.com/watch?v=beta'));
    const a = candidate(1);
    const b = candidate(2, { originalUrl: a.media.originalUrl });
    const c = candidate(3, { sha256: a.media.sha256 });
    const d = candidate(4, {
      originalUrl: a.media.originalUrl,
      timecodeMs: 5000,
      kind: 'video-frame',
    });
    const s = importReferenceCandidates(
      createReferenceSession(scope, now),
      scope,
      [a, b, c, d],
      now
    );
    expect(Object.keys(s.media)).toEqual([a.reference.id, d.reference.id]);
    expect(() =>
      importReferenceCandidates(
        s,
        scope,
        [candidate(1, { credit: 'changed' })],
        now
      )
    ).toThrow('ID already');
  });
  it('holds rejected, unverified, generated and disallowed previews out of review and design-agent top references', () => {
    const a = candidate(1, { verification: 'rejected' }),
      b = candidate(2, { verification: 'unverified' }),
      c = candidate(3, { previewUrl: null });
    const s = importReferenceCandidates(
      createReferenceSession(scope, now),
      scope,
      [a, b, c],
      now
    );
    expect(referenceView(s, scope)).toMatchObject({
      items: [],
      top: [],
      heldCount: 3,
    });
    expect(
      MediaAnchorSchema.safeParse({ ...a.media, generated: true }).success
    ).toBe(false);
    expect(
      MediaAnchorSchema.safeParse({
        ...a.media,
        previewUrl: 'http://localhost/x',
      }).success
    ).toBe(false);
    expect(Object.values(s.ratings)).toEqual([]);
  });
  it('keeps human clusters and ignores stale model labels when adapting preferences', () => {
    let s = session(2);
    const id = s.batch.ids[0];
    s.media[id].classification = {
      ...s.media[id].classification!,
      inputSha256: 'f'.repeat(64),
    };
    expect(referenceView(s, scope).items[0].category).toBeNull();
    s = applyReferenceCommand(
      s,
      scope,
      command(s, {
        type: 'create-cluster',
        clusterId: 'room',
        label: 'Room study',
      })
    );
    s = applyReferenceCommand(
      s,
      scope,
      command(s, { type: 'cluster', referenceId: id, clusterId: 'room' })
    );
    s = applyReferenceCommand(
      s,
      scope,
      command(s, { type: 'rate', referenceId: id, rating: 5 })
    );
    expect(referencePreferenceTerms(s, scope)).toEqual({
      preferred: ['Room study'],
      avoided: [],
    });
    expect(referenceView(s, scope).top[0]).toMatchObject({
      clusterId: 'room',
      rating: 5,
    });
  });
  it('changes exploitation after ratings and retains exploration diversity', () => {
    let s = session(75);
    for (const id of s.batch.ids)
      s = applyReferenceCommand(
        s,
        scope,
        command(s, {
          type: 'rate',
          referenceId: id,
          rating: s.media[id].classification?.category === 'editorial' ? 5 : 1,
        })
      );
    const categories = s.batch.ids.map(
      id => s.media[id].classification?.category
    );
    expect(categories.slice(0, 4)).toEqual([
      'editorial',
      'editorial',
      'editorial',
      'editorial',
    ]);
    expect(categories[4]).toBe('product shots');
    expect(referencePreferenceTerms(s, scope)).toMatchObject({
      preferred: ['editorial'],
      avoided: expect.arrayContaining(['product shots']),
    });
    expect(
      referencePreferenceTerms(
        createReferenceSession({ ...scope, contextId: 'other' }, now),
        { ...scope, contextId: 'other' }
      )
    ).toEqual({ preferred: [], avoided: [] });
  });
});
