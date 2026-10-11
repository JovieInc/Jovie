import { act, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { useRailToggleFocusContinuity } from './useRailToggleFocusContinuity';

function Harness({
  pinned,
  side,
}: {
  pinned: boolean;
  side: 'left' | 'right';
}) {
  useRailToggleFocusContinuity(side, pinned);
  return (
    <>
      <button
        key={pinned ? 'rail' : 'header'}
        type='button'
        data-rail-toggle={side}
      >
        {pinned ? 'Rail toggle' : 'Header toggle'}
      </button>
      <input aria-label='Editor' />
    </>
  );
}

describe.each(['left', 'right'] as const)(
  '%s moving logical toggle focus',
  side => {
    it('returns disappearing toggle focus to its replacement without scrolling', () => {
      const { rerender } = render(<Harness pinned={false} side={side} />);
      act(() => screen.getByRole('button').focus());
      rerender(<Harness pinned side={side} />);
      expect(screen.getByRole('button', { name: 'Rail toggle' })).toHaveFocus();
      rerender(<Harness pinned={false} side={side} />);
      expect(
        screen.getByRole('button', { name: 'Header toggle' })
      ).toHaveFocus();
    });
    it('preserves an editor that owns focus when the toggle changes', () => {
      const { rerender } = render(<Harness pinned={false} side={side} />);
      act(() => screen.getByRole('button').focus());
      act(() => screen.getByRole('textbox').focus());
      rerender(<Harness pinned side={side} />);
      expect(screen.getByRole('textbox')).toHaveFocus();
    });
  }
);
