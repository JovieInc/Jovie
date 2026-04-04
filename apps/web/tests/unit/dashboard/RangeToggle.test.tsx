import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { RangeToggle } from '@/features/dashboard/dashboard-analytics/RangeToggle';

describe('RangeToggle', () => {
  it('renders pill-shaped shell and active tab styling', () => {
    render(
      <RangeToggle
        value='7d'
        onChange={vi.fn()}
        tabsBaseId='analytics'
        panelId='analytics-panel'
      />
    );

    const tablist = screen.getByRole('tablist', {
      name: 'Select analytics range',
    });
    const activeTab = screen.getByRole('tab', { name: '7d' });

    expect(tablist.className).toContain('rounded-full');
    expect(activeTab.className).toContain('rounded-full');
    expect(activeTab).toHaveAttribute('aria-selected', 'true');
  });

  it('disables ranges beyond the current retention window', () => {
    render(
      <RangeToggle
        value='1d'
        onChange={vi.fn()}
        tabsBaseId='analytics'
        panelId='analytics-panel'
        maxRetentionDays={7}
      />
    );

    const disabledTab = screen.getByRole('tab', { name: '30d' });
    expect(disabledTab).toBeDisabled();
    expect(disabledTab).toHaveAttribute('aria-disabled', 'true');
  });

  it('changes the selected range when an enabled tab is clicked', () => {
    const onChange = vi.fn();

    render(
      <RangeToggle
        value='1d'
        onChange={onChange}
        tabsBaseId='analytics'
        panelId='analytics-panel'
      />
    );

    fireEvent.click(screen.getByRole('tab', { name: '30d' }));
    expect(onChange).toHaveBeenCalledWith('30d');
  });
});
