import { describe, expect, it } from 'vitest';
import { detectReversibleControl } from '@/tests/utils/reversible-control-detector';

describe('reversible-control detector', () => {
  it('certifies repeated pointer, keyboard, and mixed state cycles', async () => {
    let state: 'open' | 'closed' = 'open';

    const transitions = await detectReversibleControl({
      name: 'healthy rail',
      states: ['open', 'closed'],
      observe: () => ({ state }),
      activate: () => {
        state = state === 'open' ? 'closed' : 'open';
      },
    });

    expect(transitions).toHaveLength(6);
    expect(transitions.map(transition => transition.via)).toEqual([
      'pointer',
      'pointer',
      'keyboard',
      'keyboard',
      'pointer',
      'keyboard',
    ]);
    expect(state).toBe('open');
  });

  it('deliberate red: replays JOV-7207 when collapse removes the reopen control', async () => {
    let state: 'open' | 'closed' = 'open';
    let controlAttached = true;

    await expect(
      detectReversibleControl({
        name: 'JOV-7207 historical sidebar replay',
        states: ['open', 'closed'],
        observe: () => {
          if (!controlAttached) {
            throw new Error('sidebar toggle became detached after collapse');
          }
          return { state };
        },
        activate: () => {
          state = 'closed';
          controlAttached = false;
        },
      })
    ).rejects.toThrow('sidebar toggle became detached after collapse');
  });

  it('rejects a one-click detector that cannot prove reversibility', async () => {
    await expect(
      detectReversibleControl({
        name: 'leaf callback assertion',
        states: ['open', 'closed'],
        activationSequence: ['pointer'],
        observe: () => ({ state: 'open' }),
        activate: () => {},
      })
    ).rejects.toThrow('at least two complete cycles');
  });
});
