import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import type { AudienceMember } from '@/types';
import { AudienceLastSeenCell } from './AudienceLastSeenCell';

vi.mock('@/features/dashboard/AudienceRowActionsMenu', () => ({
  AudienceRowActionsMenu: ({
    open,
    onOpenChange,
  }: {
    readonly open: boolean;
    readonly onOpenChange: (open: boolean) => void;
  }) => (
    <button
      type='button'
      aria-expanded={open}
      onClick={() => onOpenChange(!open)}
    >
      Row actions
    </button>
  ),
}));

const row = { id: 'member-1' } as unknown as AudienceMember;

describe('AudienceLastSeenCell certificate', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-09-15T12:00:00.000Z'));
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('shows relative time and forwards menu open changes', async () => {
    const user = userEvent.setup();
    const onMenuOpenChange = vi.fn();
    const { container } = render(
      <AudienceLastSeenCell
        row={row}
        lastSeenAt='2026-08-01T12:00:00.000Z'
        isMenuOpen={false}
        onMenuOpenChange={onMenuOpenChange}
      />
    );

    expect(screen.getByText('2mo ago')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Row actions' }));
    expect(onMenuOpenChange).toHaveBeenCalledWith(true);
    await expectNoA11yViolations(container);
  });

  it('asks to close an open menu and keeps it pinned visible', async () => {
    const user = userEvent.setup();
    const onMenuOpenChange = vi.fn();
    const { container } = render(
      <AudienceLastSeenCell
        row={row}
        lastSeenAt={null}
        isMenuOpen
        onMenuOpenChange={onMenuOpenChange}
      />
    );

    expect(screen.getByText('—')).toBeInTheDocument();
    const trigger = screen.getByRole('button', { name: 'Row actions' });
    expect(trigger.parentElement).toHaveClass('opacity-100');
    await user.click(trigger);
    expect(onMenuOpenChange).toHaveBeenCalledWith(false);
    await expectNoA11yViolations(container);
  });

  it('stays axe-clean in an RTL document', async () => {
    const { container } = render(
      <div dir='rtl'>
        <AudienceLastSeenCell
          row={row}
          lastSeenAt='2026-08-01T12:00:00.000Z'
          isMenuOpen={false}
          onMenuOpenChange={vi.fn()}
        />
      </div>
    );

    expect(screen.getByRole('button', { name: 'Row actions' })).toBeVisible();
    await expectNoA11yViolations(container);
  });
});
