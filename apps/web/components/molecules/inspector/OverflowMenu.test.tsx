import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { OverflowMenu } from './OverflowMenu';

describe('OverflowMenu', () => {
  it('keeps L4 verbs inside the overflow until opened', async () => {
    const user = userEvent.setup();
    const onRevoke = vi.fn();

    render(
      <OverflowMenu
        label='Share link actions'
        testId='share-overflow'
        items={[
          {
            id: 'revoke',
            label: 'Revoke private link',
            variant: 'destructive',
            onSelect: onRevoke,
          },
        ]}
      />
    );

    expect(
      screen.queryByRole('menuitem', { name: 'Revoke private link' })
    ).not.toBeInTheDocument();

    // IconButton owns the trigger color: no unapproved override classes.
    const trigger = screen.getByRole('button', { name: 'Share link actions' });
    expect(trigger).not.toHaveClass('text-tertiary-token');
    expect(trigger).toHaveClass('text-secondary-token');

    await user.click(
      screen.getByRole('button', { name: 'Share link actions' })
    );
    await user.click(
      screen.getByRole('menuitem', { name: 'Revoke private link' })
    );

    expect(onRevoke).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId('share-overflow')).toHaveAttribute(
      'data-disclosure-level',
      'l4'
    );
  });

  it('passes triggerTabIndex through so closed drawers can pull the trigger from the tab order', async () => {
    const user = userEvent.setup();
    render(
      <OverflowMenu
        label='Destination actions for Spotify'
        triggerTabIndex={-1}
        items={[{ id: 'open', label: 'Open', onSelect: () => {} }]}
      />
    );

    const trigger = screen.getByRole('button', {
      name: 'Destination actions for Spotify',
    });
    expect(trigger).toHaveAttribute('tabindex', '-1');
    await user.click(trigger);
    expect(screen.getByRole('menuitem', { name: 'Open' })).toBeInTheDocument();
  });
});
