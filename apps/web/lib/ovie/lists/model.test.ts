import { describe, expect, it } from 'vitest';
import {
  applyListAction,
  createList,
  type ListAction,
  ListModelError,
  listMemberCount,
  type OvList,
  pendingSuggestions,
  preferenceExamples,
  suggestionPrecision,
} from './model';

const NOW = '2026-10-04T03:00:00.000Z';

function run(list: OvList, ...actions: ListAction[]): OvList {
  return actions.reduce(
    (acc, action) => applyListAction(acc, action, NOW),
    list
  );
}

function collab(): OvList {
  return createList({ id: 'l1', name: '  Collab   list ', now: NOW });
}

describe('ovie list model', () => {
  it('normalizes names and rejects empty or overlong ones', () => {
    expect(collab().name).toBe('Collab list');
    expect(() => createList({ id: 'x', name: '   ', now: NOW })).toThrow(
      ListModelError
    );
    expect(() =>
      createList({ id: 'x', name: 'a'.repeat(61), now: NOW })
    ).toThrow(ListModelError);
  });

  it('adds, rates, favorites and removes without mutating the input', () => {
    const base = collab();
    const next = run(
      base,
      { type: 'add', creatorId: 'a' },
      { type: 'rate', creatorId: 'a', rating: 4 },
      { type: 'favorite', creatorId: 'a', favorite: true }
    );
    expect(base.members).toEqual([]);
    expect(next.members).toEqual([
      expect.objectContaining({
        creatorId: 'a',
        state: 'member',
        rating: 4,
        favorite: true,
      }),
    ]);
    expect(next.labels.map(l => l.signal)).toEqual(['add', 'rate', 'favorite']);
    expect(listMemberCount(run(next, { type: 'remove', creatorId: 'a' }))).toBe(
      0
    );
  });

  it('rejects out-of-range ratings', () => {
    expect(() =>
      run(collab(), { type: 'rate', creatorId: 'a', rating: 6 })
    ).toThrow(ListModelError);
    expect(() =>
      run(collab(), { type: 'rate', creatorId: 'a', rating: 2.5 })
    ).toThrow(ListModelError);
  });

  it('maps swipes to member/passed state and labels', () => {
    const list = run(
      collab(),
      { type: 'swipe', creatorId: 'a', direction: 'right' },
      { type: 'swipe', creatorId: 'b', direction: 'left' }
    );
    expect(list.members.map(m => [m.creatorId, m.state])).toEqual([
      ['a', 'member'],
      ['b', 'passed'],
    ]);
    expect(list.labels.map(l => l.signal)).toEqual([
      'swipe_right',
      'swipe_left',
    ]);
  });

  it('suggests only undecided creators and never auto-adds', () => {
    const list = run(
      collab(),
      { type: 'add', creatorId: 'a' },
      { type: 'swipe', creatorId: 'b', direction: 'left' },
      {
        type: 'suggest',
        suggestions: [
          { creatorId: 'a', reasons: [] },
          { creatorId: 'b', reasons: [] },
          { creatorId: 'c', reasons: ['Shares indie pop with 2 of 2 picks'] },
        ],
      }
    );
    expect(pendingSuggestions(list).map(m => m.creatorId)).toEqual(['c']);
    expect(listMemberCount(list)).toBe(1);
    expect(
      list.members.find(m => m.creatorId === 'c')?.suggestionReasons
    ).toEqual(['Shares indie pop with 2 of 2 picks']);
  });

  it('turns a swipe on a suggestion into the accept/reject decision', () => {
    const list = run(
      collab(),
      {
        type: 'suggest',
        suggestions: [
          { creatorId: 'c', reasons: ['x'] },
          { creatorId: 'd', reasons: ['y'] },
        ],
      },
      { type: 'swipe', creatorId: 'c', direction: 'right' },
      { type: 'swipe', creatorId: 'd', direction: 'left' }
    );
    expect(list.labels.map(l => l.signal)).toEqual([
      'suggest',
      'suggest',
      'accept_suggestion',
      'reject_suggestion',
    ]);
    expect(suggestionPrecision(list)).toEqual({
      accepted: 1,
      rejected: 1,
      pending: 0,
      precision: 0.5,
    });
  });

  it('refuses to accept something that is not a pending suggestion', () => {
    expect(() =>
      run(collab(), { type: 'accept_suggestion', creatorId: 'zzz' })
    ).toThrow(ListModelError);
  });

  it('reports null precision before any decision', () => {
    const list = run(collab(), {
      type: 'suggest',
      suggestions: [{ creatorId: 'c', reasons: ['x'] }],
    });
    expect(suggestionPrecision(list)).toEqual({
      accepted: 0,
      rejected: 0,
      pending: 1,
      precision: null,
    });
  });

  it('derives weighted preference examples from current state', () => {
    const list = run(
      collab(),
      { type: 'swipe', creatorId: 'plain', direction: 'right' },
      { type: 'add', creatorId: 'loved' },
      { type: 'rate', creatorId: 'loved', rating: 5 },
      { type: 'favorite', creatorId: 'loved', favorite: true },
      { type: 'add', creatorId: 'meh' },
      { type: 'rate', creatorId: 'meh', rating: 2 },
      { type: 'swipe', creatorId: 'nope', direction: 'left' },
      // Later change of heart: current state wins.
      { type: 'add', creatorId: 'nope' },
      { type: 'suggest', suggestions: [{ creatorId: 'pending', reasons: [] }] }
    );
    expect(preferenceExamples(list)).toEqual([
      { creatorId: 'plain', label: 1, weight: 1 },
      { creatorId: 'loved', label: 1, weight: 3 },
      { creatorId: 'meh', label: -1, weight: 0.5 },
      { creatorId: 'nope', label: 1, weight: 1 },
    ]);
  });
});
