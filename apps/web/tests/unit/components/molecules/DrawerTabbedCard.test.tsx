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
    const contentRegion = content.parentElement;

    expect(card).toBeInTheDocument();
    expect(card).toContainElement(tablist);
    expect(card).toContainElement(content);
    expect(card.className).toContain('flex-col');
    expect(card.className).toContain('overflow-hidden');
    expect(contentRegion?.className).toContain('overflow-y-auto');
    expect(contentRegion?.className).toContain('flex-1');
    expect(contentRegion?.className).toContain('pt-2');
    expect(contentRegion?.className).toContain('pr-2');
    expect(contentRegion?.className).toContain('pb-2');
  });
});
