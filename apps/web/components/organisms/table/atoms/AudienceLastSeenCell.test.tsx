import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { AudienceMember } from '@/types';
import { AudienceLastSeenCell } from './AudienceLastSeenCell';

vi.mock('@/features/dashboard/AudienceRowActionsMenu', () => ({
  AudienceRowActionsMenu: ({ open }: { readonly open: boolean }) => (
    <button type='button' aria-expanded={open}>
      Row actions
    </button>
  ),
}));

const row = { id: 'member-1' } as unknown as AudienceMember;

describe('AudienceLastSeenCell', () => {
  it('keeps the row actions exposed to assistive tech and lets clicks reach the row', () => {
    const rowClick = vi.fn();
    render(
      // biome-ignore lint/a11y/useKeyWithClickEvents: test harness row
      <div onClick={rowClick}>
        <AudienceLastSeenCell
          row={row}
          lastSeenAt='2026-01-01T00:00:00Z'
          isMenuOpen={false}
          onMenuOpenChange={vi.fn()}
        />
      </div>
    );
    const trigger = screen.getByRole('button', { name: 'Row actions' });
    expect(trigger.parentElement).not.toHaveAttribute('aria-hidden');
    fireEvent.click(trigger);
    expect(rowClick).toHaveBeenCalledOnce();
  });

  it('pins the actions visible while the menu is open', () => {
    render(
      <AudienceLastSeenCell
        row={row}
        lastSeenAt={null}
        isMenuOpen
        onMenuOpenChange={vi.fn()}
      />
    );
    expect(
      screen.getByRole('button', { name: 'Row actions' }).parentElement
    ).toHaveClass('opacity-100', 'pointer-events-auto');
  });
});
