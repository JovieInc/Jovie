import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { AudienceQuickActionsCell } from './AudienceQuickActionsCell';

describe('AudienceQuickActionsCell', () => {
  it('exposes both actions by name and calls their handlers', async () => {
    const user = userEvent.setup();
    const onExport = vi.fn();
    const onBlock = vi.fn();
    const { container } = render(
      <AudienceQuickActionsCell onExport={onExport} onBlock={onBlock} />
    );
    await user.click(screen.getByRole('button', { name: 'Export Contact' }));
    await user.click(screen.getByRole('button', { name: 'Block Member' }));
    expect(onExport).toHaveBeenCalledOnce();
    expect(onBlock).toHaveBeenCalledOnce();
    await expectNoA11yViolations(container);
  });
});
