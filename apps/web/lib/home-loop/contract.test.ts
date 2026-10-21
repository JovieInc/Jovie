import { describe, expect, it } from 'vitest';
import {
  formatDurationSeconds,
  HOME_LOOP_NOT_MEASURED,
  type HomeLoopTile,
  rememberTiles,
  withTileHistory,
} from './contract';

type Key = 'releases' | 'streams';

function tile(key: Key, value: string | null): Omit<HomeLoopTile<Key>, 'was'> {
  return {
    key,
    label: key,
    value: value ?? HOME_LOOP_NOT_MEASURED,
    tone: 'neutral',
    measured: value !== null,
  };
}

describe('home loop tile history', () => {
  it('prefers a source comparison over remembered values', () => {
    const [releases] = withTileHistory(
      [tile('releases', '4')],
      { releases: { value: '3', was: null } },
      key => (key === 'releases' ? '2' : null)
    );
    expect(releases?.was).toBe('2');
  });

  it('remembers the last different measured value for any persona', () => {
    let memory = rememberTiles(
      {},
      withTileHistory([tile('streams', '10')], {})
    );
    const changed = withTileHistory([tile('streams', '12')], memory);
    expect(changed[0]?.was).toBe('10');
    memory = rememberTiles(memory, changed);
    expect(memory).toEqual({ streams: { value: '12', was: '10' } });
  });

  it('ignores unmeasured tiles in both directions', () => {
    const memory = { streams: { value: '10', was: null } };
    const [streams] = withTileHistory([tile('streams', null)], memory);
    expect(streams?.was).toBeNull();
    expect(
      rememberTiles(memory, [{ ...tile('streams', null), was: null }])
    ).toEqual(memory);
  });
});

describe('formatDurationSeconds', () => {
  it.each([
    [42, '42s'],
    [495, '8m'],
    [15147, '4.2h'],
    [86400, '24h'],
    [201933, '2.3d'],
  ])('formats %s seconds as %s', (value, expected) => {
    expect(formatDurationSeconds(value)).toBe(expected);
  });

  it('never turns unknown into zero', () => {
    expect(formatDurationSeconds(null)).toBe(HOME_LOOP_NOT_MEASURED);
    expect(formatDurationSeconds(-1)).toBe(HOME_LOOP_NOT_MEASURED);
  });
});
