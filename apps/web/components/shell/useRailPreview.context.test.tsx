import { act, fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { describe, expect, it } from 'vitest';
import { useRailPreview } from './useRailPreview';

function Harness({ occupied }: { readonly occupied?: boolean }) {
  const [pinned, setPinned] = useState(false);
  const { isPreview, isFloating, dismissPreview } = useRailPreview({
    side: 'right',
    pinned,
    enabled: true,
  });
  return (
    <>
      <button
        type='button'
        data-rail-toggle='right'
        data-rail-pinned={pinned}
        onClick={() => {
          dismissPreview();
          setPinned(true);
        }}
      >
        Profile toggle
      </button>
      <aside
        data-testid='app-shell-right-rail'
        data-rail-preview-region='right'
        data-preview={isPreview}
        data-floating={isFloating}
        data-pinned={pinned}
      >
        {occupied ? (
          <div data-rail-context-occupied='true'>Release context</div>
        ) : null}
        {isPreview || pinned ? (
          <div
            key={occupied ? 'context-and-profile' : 'profile-only'}
            data-rail-presentation={isFloating ? 'overlay' : 'push'}
          >
            <button type='button'>Profile action</button>
          </div>
        ) : null}
      </aside>
      <textarea aria-label='Chat draft' />
    </>
  );
}

describe('late right context from the chat stream', () => {
  it.each(['toggle', 'detached action', 'draft'] as const)(
    'hands the live passive rail to context without losing %s focus',
    async focus => {
      const { rerender } = render(<Harness />);
      const toggle = screen.getByRole('button', { name: 'Profile toggle' });
      const rail = screen.getByTestId('app-shell-right-rail');
      const draft = screen.getByRole('textbox', { name: 'Chat draft' });
      act(() => toggle.focus());
      expect(rail).toHaveAttribute('data-preview', 'true');
      expect(rail).toHaveAttribute('data-floating', 'true');
      if (focus !== 'toggle')
        act(() =>
          screen.getByRole('button', { name: 'Profile action' }).focus()
        );

      await act(async () => {
        if (focus === 'draft') draft.focus();
        rerender(<Harness occupied />);
      });

      expect(
        screen.queryByRole('button', { name: 'Profile action' })
      ).toBeNull();
      expect(rail).toHaveAttribute('data-preview', 'false');
      expect(rail).toHaveAttribute('data-floating', 'false');
      expect(focus === 'draft' ? draft : toggle).toHaveFocus();
    }
  );

  it('never closes an explicitly pinned profile rail as context arrives', async () => {
    const { rerender } = render(<Harness />);
    const toggle = screen.getByRole('button', { name: 'Profile toggle' });
    const rail = screen.getByTestId('app-shell-right-rail');
    act(() => toggle.focus());
    expect(rail).toHaveAttribute('data-floating', 'true');
    await act(async () => {
      fireEvent.click(toggle);
      rerender(<Harness occupied />);
    });
    expect(rail).toHaveAttribute('data-pinned', 'true');
    expect(rail).toHaveAttribute('data-floating', 'false');
    expect(
      screen.getByRole('button', { name: 'Profile action' })
    ).toBeVisible();
  });
});
