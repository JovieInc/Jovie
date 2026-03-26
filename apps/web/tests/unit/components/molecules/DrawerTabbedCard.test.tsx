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

    expect(card.className).toContain('rounded-[10px]');
    expect(card.className).toContain('shadow-[var(--linear-app-card-shadow)]');
    expect(card.className).toContain('p-3');
    expect(card).toContainElement(tablist);
    expect(card).toContainElement(content);
  });
});
