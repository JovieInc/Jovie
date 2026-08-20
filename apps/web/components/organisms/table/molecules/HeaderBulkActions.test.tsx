import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { HeaderBulkActions } from './HeaderBulkActions';

describe('HeaderBulkActions', () => {
  it('renders nothing when nothing is selected', () => {
    const { container } = render(
      <HeaderBulkActions selectedCount={0} bulkActions={[]} />
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('exposes a Title Case clear-selection control', async () => {
    const user = userEvent.setup();
    const onClearSelection = vi.fn();

    render(
      <HeaderBulkActions
        selectedCount={3}
        bulkActions={[]}
        onClearSelection={onClearSelection}
      />
    );

    expect(screen.getByText('3 selected')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Clear Selection' }));
    expect(onClearSelection).toHaveBeenCalledOnce();
  });
});
