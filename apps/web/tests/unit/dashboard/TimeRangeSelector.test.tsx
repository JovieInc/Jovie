import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { TimeRangeSelector } from '@/components/molecules/TimeRangeSelector';

describe('TimeRangeSelector (tabs variant)', () => {
  it('renders pill-shaped shell and active tab styling', () => {
    render(
      <TimeRangeSelector
        variant='tabs'
        value='7d'
        onValueChange={vi.fn()}
        ranges={['1d', '7d', '30d']}
        tabsBaseId='analytics'
        panelId='analytics-panel'
      />
    );

    const tablist = screen.getByRole('tablist', {
      name: 'Select Analytics Range',
    });
    const activeTab = screen.getByRole('tab', { name: '7D' });

    expect(tablist.className).toContain('rounded-full');
    expect(activeTab.className).toContain('rounded-full');
    expect(activeTab).toHaveAttribute('aria-selected', 'true');
  });

  it('disables ranges beyond the current retention window', () => {
    render(
      <TimeRangeSelector
        variant='tabs'
        value='1d'
        onValueChange={vi.fn()}
        ranges={['1d', '7d', '30d']}
        tabsBaseId='analytics'
        panelId='analytics-panel'
        maxRetentionDays={7}
      />
    );

    const disabledTab = screen.getByRole('tab', { name: '30D' });
    expect(disabledTab).toBeDisabled();
    expect(disabledTab).toHaveAttribute('aria-disabled', 'true');
  });

  it('changes the selected range when an enabled tab is clicked', () => {
    const onValueChange = vi.fn();

    render(
      <TimeRangeSelector
        variant='tabs'
        value='1d'
        onValueChange={onValueChange}
        ranges={['1d', '7d', '30d']}
        tabsBaseId='analytics'
        panelId='analytics-panel'
      />
    );

    fireEvent.click(screen.getByRole('tab', { name: '30D' }));
    expect(onValueChange).toHaveBeenCalledWith('30d');
  });
});

describe('TimeRangeSelector (menu variant)', () => {
  it('shows the canonical menu label for the selected range', () => {
    render(
      <TimeRangeSelector
        variant='menu'
        value='30d'
        onValueChange={vi.fn()}
        ranges={['7d', '30d', '90d', 'all']}
        lockedRanges={['90d', 'all']}
      />
    );

    expect(
      screen.getByRole('button', { name: 'Analytics Time Range' })
    ).toHaveTextContent('Last 30 Days');
  });

  it('locks plan-gated ranges in the dropdown', () => {
    render(
      <TimeRangeSelector
        variant='menu'
        value='30d'
        onValueChange={vi.fn()}
        ranges={['7d', '30d', '90d', 'all']}
        lockedRanges={['90d', 'all']}
      />
    );

    fireEvent.click(
      screen.getByRole('button', { name: 'Analytics Time Range' })
    );

    const lockedItem = screen.getByRole('menuitem', { name: /All Time/ });
    expect(lockedItem).toHaveAttribute('aria-disabled', 'true');
  });
});
