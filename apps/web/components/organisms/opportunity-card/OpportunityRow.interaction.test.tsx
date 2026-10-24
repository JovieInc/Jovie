import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, it, vi } from 'vitest';
import { OpportunityRow } from './OpportunityRow';

it('preserves the focused action and card target when entity media arrives', async () => {
  const user = userEvent.setup();
  const onPrimaryAction = vi.fn();
  const props = {
    id: 'opportunity-1',
    state: 'new' as const,
    title: 'Review Release',
    metadata: 'Catalog Match',
    entity: {
      kind: 'release' as const,
      id: 'release-1',
      label: 'A Long Release Name',
    },
    onPrimaryAction,
  };
  const { rerender } = render(<OpportunityRow {...props} />);
  const action = screen.getByRole('button', { name: 'Plan Opportunity' });
  action.focus();
  const header = screen.getByTestId('entity-header');
  rerender(
    <OpportunityRow
      {...props}
      entity={{ ...props.entity, imageUrl: 'https://i.scdn.co/art.jpg' }}
    />
  );
  expect(screen.getByTestId('entity-header')).toBe(header);
  expect(screen.getByRole('button', { name: 'Plan Opportunity' })).toBe(action);
  expect(action).toHaveFocus();
  expect(
    header.querySelector('[data-entity-header-thumbnail-variant]')
  ).toHaveAttribute('style', 'width: 28px; height: 28px;');
  await user.keyboard('{Enter}');
  expect(onPrimaryAction).toHaveBeenCalledWith('opportunity-1');
});
