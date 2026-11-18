import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { AudienceQuickActionsCell } from './AudienceQuickActionsCell';

describe('AudienceQuickActionsCell', () => {
  it('runs both actions without activating their parent row', async () => {
    const user = userEvent.setup();
    const onExport = vi.fn();
    const onBlock = vi.fn();
    const onRowClick = vi.fn();
    const onRowKeyDown = vi.fn();
    const { container } = render(
      <AudienceQuickActionsCell onExport={onExport} onBlock={onBlock} />
    );
    const parent = container.parentElement;
    if (!parent) throw new Error('Missing parent');
    parent.addEventListener('click', onRowClick);
    parent.addEventListener('keydown', onRowKeyDown);
    await user.click(screen.getByRole('button', { name: 'Export Contact' }));
    await user.click(screen.getByRole('button', { name: 'Block Member' }));
    expect(onExport).toHaveBeenCalledOnce();
    expect(onBlock).toHaveBeenCalledOnce();
    expect(onRowClick).not.toHaveBeenCalled();
    await user.keyboard('{Enter}');
    expect(onRowKeyDown).not.toHaveBeenCalled();
    parent.removeEventListener('click', onRowClick);
    parent.removeEventListener('keydown', onRowKeyDown);
    await expectNoA11yViolations(container);
  });
  it('keeps both actions accessible in RTL', async () => {
    const user = userEvent.setup();
    const onExport = vi.fn();
    const { container } = render(
      <div dir='rtl'>
        <AudienceQuickActionsCell onExport={onExport} onBlock={vi.fn()} />
      </div>
    );
    await user.click(screen.getByRole('button', { name: 'Export Contact' }));
    expect(onExport).toHaveBeenCalledOnce();
    await expectNoA11yViolations(container);
  });
});
