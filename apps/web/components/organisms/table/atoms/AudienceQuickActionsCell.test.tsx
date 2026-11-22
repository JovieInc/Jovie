import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { FormEvent } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { AudienceQuickActionsCell } from './AudienceQuickActionsCell';

describe('AudienceQuickActionsCell', () => {
  it('keeps both verbs as shared-capacity primaries (no overflow strip)', async () => {
    const user = userEvent.setup();
    const onExport = vi.fn();
    const onBlock = vi.fn();
    const { container } = render(
      <AudienceQuickActionsCell onExport={onExport} onBlock={onBlock} />
    );

    // Two actions fit ACTION_OVERFLOW_MAX_PRIMARY — no ⋯ trigger.
    expect(
      screen.queryByRole('button', { name: 'Audience member actions' })
    ).toBeNull();
    expect(screen.getAllByRole('button')).toHaveLength(2);

    await user.click(screen.getByRole('button', { name: 'Export Contact' }));
    await user.click(screen.getByRole('button', { name: 'Block Member' }));
    expect(onExport).toHaveBeenCalledOnce();
    expect(onBlock).toHaveBeenCalledOnce();
    await expectNoA11yViolations(container);
  });
});

describe('AudienceQuickActionsCell form safety', () => {
  it('renders both IconButton actions as type=button so they never submit a form', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn((e: FormEvent) => e.preventDefault());
    render(
      <form onSubmit={onSubmit}>
        <AudienceQuickActionsCell onExport={vi.fn()} onBlock={vi.fn()} />
      </form>
    );
    const exportButton = screen.getByRole('button', { name: 'Export Contact' });
    const blockButton = screen.getByRole('button', { name: 'Block Member' });
    expect(exportButton).toHaveAttribute('type', 'button');
    expect(blockButton).toHaveAttribute('type', 'button');
    await user.click(exportButton);
    await user.click(blockButton);
    expect(onSubmit).not.toHaveBeenCalled();
  });
});
