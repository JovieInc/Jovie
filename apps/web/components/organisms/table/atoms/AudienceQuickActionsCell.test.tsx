import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { AudienceQuickActionsCell } from './AudienceQuickActionsCell';

describe('AudienceQuickActionsCell', () => {
  it('exposes Title Case export and block actions', () => {
    const onExport = vi.fn();
    const onBlock = vi.fn();

    render(<AudienceQuickActionsCell onExport={onExport} onBlock={onBlock} />);

    fireEvent.click(screen.getByRole('button', { name: 'Export Contact' }));
    fireEvent.click(screen.getByRole('button', { name: 'Block Member' }));

    expect(onExport).toHaveBeenCalledOnce();
    expect(onBlock).toHaveBeenCalledOnce();
  });
});
