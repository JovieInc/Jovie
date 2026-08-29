import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { DrawerPropertyRow } from './DrawerPropertyRow';

describe('DrawerPropertyRow', () => {
  it('keeps read-only properties non-interactive and supports an explicit action mode', () => {
    const onClick = vi.fn();

    const { rerender } = render(
      <DrawerPropertyRow label='Status' value='Ready' />
    );
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
    expect(screen.getByText('Status')).toBeInTheDocument();
    expect(screen.getByText('Ready')).toBeInTheDocument();

    rerender(
      <DrawerPropertyRow
        label='Status'
        value='Ready'
        interactive
        labelWidth={120}
        align='start'
        size='sm'
        onClick={onClick}
      />
    );

    const property = screen.getByRole('button', { name: 'Status Ready' });
    expect(property).toHaveStyle({
      gridTemplateColumns: '120px minmax(0, 1fr)',
    });
    fireEvent.click(property);
    expect(onClick).toHaveBeenCalledOnce();
  });
});
