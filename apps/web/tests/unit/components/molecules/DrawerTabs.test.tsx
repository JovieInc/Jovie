import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { DrawerTabs } from '@/components/molecules/drawer/DrawerTabs';

describe('DrawerTabs', () => {
  it('renders the tab rail as a borderless wrapper inside the parent card', () => {
    render(
      <DrawerTabs
        value='details'
        onValueChange={vi.fn()}
        options={[
          { value: 'details', label: 'Details' },
          { value: 'activity', label: 'Activity' },
        ]}
        ariaLabel='Drawer tabs'
      />
    );

    const tablist = screen.getByRole('tablist', { name: 'Drawer tabs' });
    expect(tablist).toBeInTheDocument();
    expect(tablist).toHaveAttribute('aria-label', 'Drawer tabs');
  });

  it('renders active tabs as pills and notifies on selection changes', () => {
    const onValueChange = vi.fn();

    render(
      <DrawerTabs
        value='details'
        onValueChange={onValueChange}
        options={[
          { value: 'details', label: 'Details' },
          { value: 'activity', label: 'Activity' },
        ]}
        ariaLabel='Drawer tabs'
      />
    );

    const activeTab = screen.getByRole('tab', { name: 'Details' });
    const inactiveTab = screen.getByRole('tab', { name: 'Activity' });

    expect(activeTab).toHaveAttribute('aria-selected', 'true');
    expect(inactiveTab).toHaveAttribute('aria-selected', 'false');

    fireEvent.click(inactiveTab);
    expect(onValueChange).toHaveBeenCalledWith('activity');
  });

  it('renders optional tab actions outside the tablist rail', () => {
    render(
      <DrawerTabs
        value='details'
        onValueChange={vi.fn()}
        options={[
          { value: 'details', label: 'Details' },
          { value: 'activity', label: 'Activity' },
        ]}
        ariaLabel='Drawer tabs'
        actions={<button type='button'>Add platform</button>}
      />
    );

    expect(
      screen.getByRole('button', { name: 'Add platform' })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('tablist', { name: 'Drawer tabs' })
    ).toContainElement(screen.getByRole('tab', { name: 'Details' }));
  });

  it('renders a dedicated horizontal scroller in scroll mode while keeping actions outside it', () => {
    render(
      <DrawerTabs
        value='details'
        onValueChange={vi.fn()}
        options={[
          { value: 'details', label: 'Details' },
          { value: 'activity', label: 'Activity' },
          { value: 'tasks', label: 'Tasks' },
        ]}
        ariaLabel='Drawer tabs'
        overflowMode='scroll'
        actions={<button type='button'>Add platform</button>}
      />
    );

    const scroller = screen.getByTestId('drawer-tabs-scroll');
    const tablist = screen.getByRole('tablist', { name: 'Drawer tabs' });
    const actionsButton = screen.getByRole('button', { name: 'Add platform' });

    expect(scroller).toContainElement(tablist);
    expect(scroller).not.toContainElement(actionsButton);
  });
});
