import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { AudienceQuickActionsCell } from './AudienceQuickActionsCell';

describe('AudienceQuickActionsCell certificate', () => {
  it('keeps row clicks and keys from bubbling past the toolbar', async () => {
    const user = userEvent.setup();
    const onRowClick = vi.fn();
    const onRowKeyDown = vi.fn();
    const onExport = vi.fn();
    const { container } = render(
      // biome-ignore lint/a11y/noStaticElementInteractions: test row stands in for the table row
      <div onClick={onRowClick} onKeyDown={onRowKeyDown}>
        <AudienceQuickActionsCell
          onExport={onExport}
          onBlock={vi.fn()}
          className='custom'
        />
      </div>
    );

    await user.click(screen.getByRole('button', { name: 'Export Contact' }));
    expect(onExport).toHaveBeenCalledOnce();
    screen.getByRole('button', { name: 'Block Member' }).focus();
    await user.keyboard('{Enter}');
    expect(onRowClick).not.toHaveBeenCalled();
    expect(onRowKeyDown).not.toHaveBeenCalled();
    expect(screen.getByRole('toolbar')).toHaveClass('custom');
    await expectNoA11yViolations(container);
  });

  it('stays axe-clean in a right-to-left row', async () => {
    const { container } = render(
      <div dir='rtl'>
        <AudienceQuickActionsCell onExport={vi.fn()} onBlock={vi.fn()} />
      </div>
    );

    expect(screen.getAllByRole('button')).toHaveLength(2);
    await expectNoA11yViolations(container);
  });
});
