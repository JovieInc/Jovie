import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import {
  DrawerNav,
  type DrawerNavItem,
} from '@/components/organisms/contact-sidebar/DrawerNav';

const items: DrawerNavItem[] = [
  { value: 'details', label: 'Details' },
  { value: 'social', label: 'Social' },
  { value: 'notes', label: 'Notes' },
];

describe('DrawerNav', () => {
  it('renders all nav items with labels', () => {
    render(
      <DrawerNav items={items} value='details' onValueChange={() => {}} />
    );

    expect(screen.getByRole('tab', { name: /details/i })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /social/i })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /notes/i })).toBeInTheDocument();
  });

  it('renders nav with aria-label', () => {
    render(
      <DrawerNav items={items} value='details' onValueChange={() => {}} />
    );

    expect(screen.getByLabelText('Drawer navigation')).toBeInTheDocument();
  });

  it('active tab has aria-selected=true, others false', () => {
    render(<DrawerNav items={items} value='social' onValueChange={() => {}} />);

    const tabs = screen.getAllByRole('tab');
    expect(tabs[0]).toHaveAttribute('aria-selected', 'false');
    expect(tabs[1]).toHaveAttribute('aria-selected', 'true');
    expect(tabs[2]).toHaveAttribute('aria-selected', 'false');
  });

  it('clicking inactive tab calls onValueChange with correct value', async () => {
    const onValueChange = vi.fn();
    const user = userEvent.setup();

    render(
      <DrawerNav items={items} value='details' onValueChange={onValueChange} />
    );

    await user.click(screen.getByRole('tab', { name: /notes/i }));

    expect(onValueChange).toHaveBeenCalledWith('notes');
    expect(onValueChange).toHaveBeenCalledTimes(1);
  });

  it('renders icons when provided', () => {
    const itemsWithIcons: DrawerNavItem[] = [
      {
        value: 'details',
        label: 'Details',
        icon: <svg data-testid='icon-details' />,
      },
      {
        value: 'social',
        label: 'Social',
        icon: <svg data-testid='icon-social' />,
      },
    ];

    render(
      <DrawerNav
        items={itemsWithIcons}
        value='details'
        onValueChange={() => {}}
      />
    );

    expect(screen.getByTestId('icon-details')).toBeInTheDocument();
    expect(screen.getByTestId('icon-social')).toBeInTheDocument();
  });

  it('handles empty items list', () => {
    render(<DrawerNav items={[]} value='' onValueChange={() => {}} />);

    expect(screen.getByLabelText('Drawer navigation')).toBeInTheDocument();
    expect(screen.queryByRole('tab')).not.toBeInTheDocument();
  });
});
