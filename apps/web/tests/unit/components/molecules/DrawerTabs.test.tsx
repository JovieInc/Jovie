import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { DrawerTabs } from '@/components/molecules/drawer/DrawerTabs';

describe('DrawerTabs', () => {
  it('renders the tab rail as a bordered grouped surface', () => {
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
    expect(tablist.className).toContain('rounded-[10px]');
    expect(tablist.className).toContain('border-(--linear-app-frame-seam)');
    expect(tablist.className).toContain('p-1');
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
    expect(inactiveTab.className).toContain('rounded-full');

    fireEvent.click(inactiveTab);
    expect(onValueChange).toHaveBeenCalledWith('activity');
  });
});
