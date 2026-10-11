import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { SidebarLinkInput } from './SidebarLinkInput';

describe('SidebarLinkInput', () => {
  it('renders the link URL input', () => {
    render(
      <SidebarLinkInput
        categoryFilter='social'
        existingPlatforms={[]}
        onAdd={vi.fn()}
        onCancel={vi.fn()}
      />
    );

    expect(screen.getByRole('textbox')).toBeInTheDocument();
  });

  it('calls onCancel when Escape is pressed with the autosuggest closed', async () => {
    const user = userEvent.setup();
    const onCancel = vi.fn();

    render(
      <SidebarLinkInput
        categoryFilter='social'
        existingPlatforms={[]}
        onAdd={vi.fn()}
        onCancel={onCancel}
      />
    );

    const input = screen.getByRole('textbox');
    input.focus();
    await user.keyboard('{Escape}');

    expect(onCancel).toHaveBeenCalledTimes(1);
  });
});
