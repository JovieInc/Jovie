import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { DrawerTabbedCard } from '@/components/molecules/drawer/DrawerTabbedCard';
import { DrawerTabs } from '@/components/molecules/drawer/DrawerTabs';

describe('DrawerTabbedCard', () => {
  it('keeps tabs and active content inside one rounded card surface', () => {
    render(
      <DrawerTabbedCard
        testId='drawer-tabbed-card'
        tabs={
          <DrawerTabs
            value='details'
            onValueChange={vi.fn()}
            options={[
              { value: 'details', label: 'Details' },
              { value: 'activity', label: 'Activity' },
            ]}
            ariaLabel='Drawer card tabs'
          />
        }
      >
        <div>Details content</div>
      </DrawerTabbedCard>
    );

    const card = screen.getByTestId('drawer-tabbed-card');
    const tablist = screen.getByRole('tablist', { name: 'Drawer card tabs' });
    const content = screen.getByText('Details content');
    const scrollRegion = screen.getByTestId('drawer-tabbed-card-scroll-region');

    expect(card).toBeInTheDocument();
    expect(card).toContainElement(tablist);
    expect(card).toContainElement(content);
    expect(card).toHaveClass('flex-1', 'min-h-0', 'flex', 'flex-col');
    expect(card).not.toHaveClass('h-full');
    expect(scrollRegion).toHaveAttribute('data-scroll-mode', 'internal');
    expect(scrollRegion).toHaveClass(
      'min-h-0',
      'flex-1',
      'overflow-y-auto',
      'overscroll-contain'
    );
  });
});
