import { act, render, screen, waitFor } from '@testing-library/react';
import type { FeatureBundle } from 'motion/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ColumnSnapMotion } from './ColumnSnapMotion';

const state = vi.hoisted(() => ({
  reduced: false,
  features: [] as (() => Promise<FeatureBundle>)[],
  imports: vi.fn(),
}));
vi.mock('@/lib/hooks/useReducedMotion', () => ({
  useReducedMotion: () => state.reduced,
}));
vi.mock('motion/react', () => ({
  LazyMotion: ({
    children,
    features,
  }: {
    children: ReactNode;
    features: () => Promise<FeatureBundle>;
  }) => {
    state.features.push(features);
    return children;
  },
}));

function table(enabled: boolean) {
  return (
    <ColumnSnapMotion enabled={enabled}>
      <table>
        <tbody>
          <tr>
            <td>
              <button type='button'>Select fan</button>
            </td>
          </tr>
        </tbody>
      </table>
    </ColumnSnapMotion>
  );
}

describe('ColumnSnapMotion', () => {
  beforeEach(() => {
    state.reduced = false;
    state.features = [];
    state.imports.mockReset();
    vi.resetModules();
    vi.doMock('./column-snap-features', async () => ({
      default: await state.imports(),
    }));
  });

  it.each(['disabled', 'reduced'] as const)(
    'does not load the layout engine for %s motion',
    async mode => {
      state.reduced = mode === 'reduced';
      render(table(mode !== 'disabled'));
      await act(async () => {
        await Promise.resolve();
      });
      expect(state.imports).not.toHaveBeenCalled();
      expect(screen.getByRole('cell')).toHaveTextContent('Select fan');
    }
  );

  it('loads after enabling motion and preserves the table node, focus, and loader identity', async () => {
    let deliver!: (value: FeatureBundle) => void;
    state.imports.mockImplementation(
      () =>
        new Promise<FeatureBundle>(resolve => {
          deliver = resolve;
        })
    );
    const { rerender } = render(table(false));
    const cell = screen.getByRole('cell');
    const button = screen.getByRole('button');
    button.focus();
    const loader = state.features[0];
    rerender(table(true));
    await waitFor(() => expect(state.imports).toHaveBeenCalledTimes(1));
    const bundle: FeatureBundle = { renderer: vi.fn() };
    await act(async () => {
      deliver(bundle);
      await loader();
    });
    expect(await loader()).toBe(bundle);
    expect(state.features.every(features => features === loader)).toBe(true);
    expect(screen.getByRole('cell')).toBe(cell);
    expect(screen.getByRole('button')).toBe(button);
    expect(button).toHaveFocus();
    rerender(table(false));
    rerender(table(true));
    expect(state.imports).toHaveBeenCalledTimes(1);
  });

  it('keeps pending features inactive after reduced motion is requested', async () => {
    let deliver!: (value: FeatureBundle) => void;
    state.imports.mockImplementation(
      () =>
        new Promise<FeatureBundle>(resolve => {
          deliver = resolve;
        })
    );
    const { rerender } = render(table(true));
    await waitFor(() => expect(state.imports).toHaveBeenCalledTimes(1));
    let released = false;
    state.features[0]().then(() => {
      released = true;
    });
    state.reduced = true;
    rerender(table(true));
    await act(async () => {
      deliver({ renderer: vi.fn() });
    });
    expect(released).toBe(false);
    expect(screen.getByRole('button')).toBeVisible();
  });

  it('keeps the static table usable when the feature chunk cannot load', async () => {
    const warning = vi.spyOn(console, 'warn').mockImplementation(() => {});
    state.imports.mockRejectedValue(new Error('offline'));
    render(table(true));
    await waitFor(() =>
      expect(warning).toHaveBeenCalledWith(
        'Column snap motion features could not load'
      )
    );
    const button = screen.getByRole('button');
    button.focus();
    expect(button).toHaveFocus();
    expect(screen.getByRole('cell')).toHaveTextContent('Select fan');
    warning.mockRestore();
  });
});
