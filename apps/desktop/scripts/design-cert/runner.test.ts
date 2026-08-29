import { describe, expect, it } from 'vitest';
import { selectMainWindow, selectRendererTargets } from './run';

function window(id: number, width: number, height: number, onScreen = true) {
  return {
    window_id: id,
    pid: 42,
    app_name: 'Jovie Local',
    title: `Window ${id}`,
    bounds: { x: 0, y: 0, width, height },
    is_on_screen: onScreen,
    on_current_space: onScreen,
    z_index: id,
  };
}

describe('desktop design certification runner', () => {
  it('selects the largest visible current-Space window deterministically', () => {
    expect(
      selectMainWindow(
        [window(1, 33, 33), window(2, 1440, 900), window(3, 1600, 1000, false)],
        null
      )?.window_id
    ).toBe(2);
  });

  it('honors an exact requested window even when it is not the largest', () => {
    expect(
      selectMainWindow([window(1, 200, 200), window(2, 1440, 900)], 1)
        ?.window_id
    ).toBe(1);
  });

  it('fails closed when the requested window is absent', () => {
    expect(selectMainWindow([window(1, 1440, 900)], 99)).toBeNull();
  });

  it('retains typed CDP page targets and drops malformed observations', () => {
    expect(
      selectRendererTargets([
        {
          id: 'page-1',
          type: 'page',
          title: 'Ops | Jovie',
          url: 'http://127.0.0.1:3187/hud',
        },
        { id: 2, type: 'page', title: 'invalid', url: 'about:blank' },
      ])
    ).toEqual([
      {
        id: 'page-1',
        type: 'page',
        title: 'Ops | Jovie',
        url: 'http://127.0.0.1:3187/hud',
      },
    ]);
  });
});
