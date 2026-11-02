import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { EmptyState } from './EmptyState';

describe('quiet EmptyState', () => {
  it('shows one sentence without decorative or supporting content', () => {
    const { container } = render(
      <EmptyState
        presentation='quiet'
        heading='Nothing needs your decision.'
        description='Supporting copy'
        icon={<span>Decoration</span>}
        secondaryAction={{ label: 'Secondary', onClick: vi.fn() }}
      />
    );
    expect(screen.getByRole('status')).toHaveAccessibleName(
      'Nothing needs your decision.'
    );
    expect(screen.queryByRole('heading')).toBeNull();
    expect(screen.getByRole('status')).not.toHaveAttribute('aria-describedby');
    expect(screen.queryByText('Supporting copy')).toBeNull();
    expect(screen.queryByText('Decoration')).toBeNull();
    expect(screen.queryByRole('button')).toBeNull();
    expect(container.querySelector('[data-empty-state-card]')).toBeNull();
  });

  it('offers at most one action and invokes its handler', () => {
    const retry = vi.fn();
    render(
      <EmptyState
        presentation='quiet'
        heading='No decisions available.'
        action={{ label: 'Refresh', onClick: retry }}
        secondaryAction={{ label: 'Secondary', onClick: vi.fn() }}
      />
    );
    expect(screen.getAllByRole('button')).toHaveLength(1);
    fireEvent.click(screen.getByRole('button', { name: 'Refresh' }));
    expect(retry).toHaveBeenCalledOnce();
  });
});
