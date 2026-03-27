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
    expect(tablist.className).toContain('rounded-full');
    expect(tablist.className).toContain('border-0');
    expect(tablist.className).toContain('p-0');
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
    expect(activeTab.className).toContain('rounded-full');
    expect(activeTab.className).toContain('border-(--linear-app-frame-seam)');
    expect(inactiveTab.className).toContain('border-(--linear-app-frame-seam)');
    expect(inactiveTab.className).toContain('rounded-full');

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
});
