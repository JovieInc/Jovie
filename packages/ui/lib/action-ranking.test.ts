import { describe, expect, it } from 'vitest';
import {
  ACTION_OVERFLOW_MAX_PRIMARY,
  ACTION_RANK_DEFAULT,
  ACTION_RANK_DESTRUCTIVE,
  partitionRankedActions,
  type RankableAction,
} from './action-ranking';

function action(
  id: string,
  extras: Omit<RankableAction, 'id'> = {}
): RankableAction {
  return { id, ...extras };
}

describe('partitionRankedActions', () => {
  it('exports the shared max-primary capacity of 2', () => {
    expect(ACTION_OVERFLOW_MAX_PRIMARY).toBe(2);
    expect(ACTION_RANK_DEFAULT).toBe(100);
    expect(ACTION_RANK_DESTRUCTIVE).toBe(1000);
  });

  it('keeps up to maxPrimary inline and overflows the rest by priority', () => {
    const { primary, overflow } = partitionRankedActions([
      action('edit', { priority: 10 }),
      action('share', { priority: 20 }),
      action('archive', { priority: 30 }),
      action('delete', { destructive: true }),
    ]);

    expect(primary.map(item => item.id)).toEqual(['edit', 'share']);
    expect(overflow.map(item => item.id)).toEqual(['archive', 'delete']);
  });

  it('honors forced placement and never puts overflow items inline', () => {
    const { primary, overflow } = partitionRankedActions([
      action('danger', { placement: 'overflow', priority: 1 }),
      action('copy', { placement: 'primary', priority: 50 }),
      action('open', { priority: 5 }),
      action('edit', { priority: 6 }),
    ]);

    expect(primary.map(item => item.id)).toEqual(['copy', 'open']);
    expect(overflow.map(item => item.id)).toEqual(['danger', 'edit']);
  });

  it('spills forced primaries past capacity into overflow', () => {
    const { primary, overflow } = partitionRankedActions(
      [
        action('a', { placement: 'primary' }),
        action('b', { placement: 'primary' }),
        action('c', { placement: 'primary' }),
      ],
      { maxPrimary: 2 }
    );

    expect(primary.map(item => item.id)).toEqual(['a', 'b']);
    expect(overflow.map(item => item.id)).toEqual(['c']);
  });

  it('overflows everything when maxPrimary is 0', () => {
    const items = [action('edit'), action('share')];
    const { primary, overflow } = partitionRankedActions(items, {
      maxPrimary: 0,
    });
    expect(primary).toEqual([]);
    expect(overflow.map(item => item.id)).toEqual(['edit', 'share']);
  });

  it('preserves stable order for equal priorities', () => {
    const { primary, overflow } = partitionRankedActions([
      action('first'),
      action('second'),
      action('third'),
    ]);
    expect(primary.map(item => item.id)).toEqual(['first', 'second']);
    expect(overflow.map(item => item.id)).toEqual(['third']);
  });
});
