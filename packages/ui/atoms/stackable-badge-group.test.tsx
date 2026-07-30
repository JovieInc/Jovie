import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';

import {
  StackableBadgeGroup,
  type StackableBadgeItem,
} from './stackable-badge-group';

const ITEMS: readonly StackableBadgeItem[] = [
  {
    id: 'spotify',
    label: 'Spotify for Artists with a deliberately long label',
    icon: <span>Sp</span>,
    tone: 'success',
  },
  { id: 'apple', label: 'Apple Music', icon: <span>Am</span>, tone: 'info' },
  { id: 'apple-duplicate', label: 'Apple Music', icon: <span>Am</span> },
  { id: 'youtube', label: 'YouTube', icon: <span>Yt</span>, disabled: true },
];

describe('StackableBadgeGroup', () => {
  it('returns null for an empty list', () => {
    const { container } = render(<StackableBadgeGroup items={[]} />);
    expect(container.firstChild).toBeNull();
  });

  it('keeps a compact fixed table slot and clamps the primary label', () => {
    render(<StackableBadgeGroup items={ITEMS} />);

    const group = screen.getByRole('group');
    expect(group).toHaveClass('h-5');
    expect(group).toHaveClass('w-32');
    expect(group).toHaveClass('overflow-hidden');
    expect(screen.getByText(ITEMS[0].label)).toHaveClass('truncate');
  });

  it('keeps the consumer-selected standard slot stable as item counts change', () => {
    const { rerender } = render(
      <StackableBadgeGroup items={ITEMS.slice(0, 1)} width='standard' />
    );

    expect(screen.getByRole('group')).toHaveClass('w-40');
    rerender(<StackableBadgeGroup items={ITEMS} width='standard' />);
    expect(screen.getByRole('group')).toHaveClass('w-40');
  });

  it('preserves input order and supports duplicate icons and labels', async () => {
    const user = userEvent.setup();
    render(<StackableBadgeGroup items={ITEMS} maxVisible={2} />);

    await user.click(
      screen.getByRole('button', { name: 'Show 2 more badges' })
    );

    const rows = screen.getAllByRole('listitem');
    ITEMS.forEach((item, index) => {
      expect(within(rows[index]).getByText(item.label)).toBeInTheDocument();
    });
    expect(screen.getAllByText('Am')).toHaveLength(3);
  });

  it('caps visible entries and discloses the exact overflow count', () => {
    render(<StackableBadgeGroup items={ITEMS} maxVisible={2} />);

    expect(
      screen.getByRole('button', { name: 'Show 2 more badges' })
    ).toHaveTextContent('+2 more');
  });

  it('does not render a disclosure when every item is visible', () => {
    render(<StackableBadgeGroup items={ITEMS} maxVisible={4} />);
    expect(
      screen.queryByRole('button', { name: /show .* more badges/i })
    ).toBeNull();
  });

  it('uses logical overlap and retains RTL direction on the group', () => {
    render(<StackableBadgeGroup dir='rtl' items={ITEMS} maxVisible={2} />);

    const group = screen.getByRole('group');
    expect(group).toHaveAttribute('dir', 'rtl');
    expect(screen.getByTitle('Apple Music')).toHaveClass('-ms-1.5');
  });

  it('renders selected and disabled states with shared token classes', () => {
    render(
      <StackableBadgeGroup
        items={[
          { id: 'selected', label: 'Selected', selected: true },
          { id: 'disabled', label: 'Disabled', disabled: true },
        ]}
        maxVisible={2}
      />
    );

    expect(screen.getByTitle('Selected')).toHaveClass('ring-1');
    expect(screen.getByTitle('Disabled')).toHaveClass('opacity-50');
  });

  it('opens a keyboard-accessible full list through the overflow control', async () => {
    const user = userEvent.setup();
    render(<StackableBadgeGroup items={ITEMS} maxVisible={1} />);

    const trigger = screen.getByRole('button', { name: 'Show 3 more badges' });
    await user.tab();
    expect(trigger).toHaveFocus();
    await user.keyboard('{Enter}');

    expect(
      screen.getByRole('list', { name: 'All badges' })
    ).toBeInTheDocument();
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('list', { name: 'All badges' })).toBeNull();
  });
});
