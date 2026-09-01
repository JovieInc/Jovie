import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
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

  it('uses the canonical segment trigger contract for tab focus, hit target, and motion', () => {
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

    const activeTab = screen.getByRole('tab', { name: '7D' });
    const inactiveTab = screen.getByRole('tab', { name: '30D' });

    expect(activeTab.className).toContain('before:h-11');
    expect(activeTab.className).toContain('before:min-w-11');
    expect(activeTab.className).toContain('focus-visible:ring-focus/55');
    expect(activeTab.className).toContain('motion-reduce:transition-none');
    expect(activeTab.className).toContain('data-[state=active]:bg-surface-0');
    expect(activeTab.className).not.toContain('focus-visible:ring-ring/30');
    expect(inactiveTab.className).toContain('hover:text-secondary-token');
  });

  it('wires the external analytics panel to package-owned tabs', () => {
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

    const activeTab = screen.getByRole('tab', { name: '7D' });
    const inactiveTab = screen.getByRole('tab', { name: '30D' });

    expect(activeTab).toHaveAttribute('id', 'analytics-tab-7d');
    expect(activeTab).toHaveAttribute('aria-controls', 'analytics-panel');
    expect(inactiveTab).toHaveAttribute('id', 'analytics-tab-30d');
    expect(inactiveTab).toHaveAttribute('aria-controls', 'analytics-panel');
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
    expect(disabledTab).toHaveAttribute('data-disabled', '');
    expect(disabledTab).toHaveAttribute(
      'title',
      'Upgrade to Pro for extended analytics'
    );
  });

  it('changes the selected range when an enabled tab is clicked', async () => {
    const user = userEvent.setup();
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

    await user.click(screen.getByRole('tab', { name: '30D' }));
    expect(onValueChange).toHaveBeenCalledWith('30d');
  });

  it('keeps keyboard navigation on the canonical tab implementation', async () => {
    const user = userEvent.setup();
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

    screen.getByRole('tab', { name: '1D' }).focus();
    await user.keyboard('{ArrowRight}');

    expect(onValueChange).toHaveBeenCalledWith('7d');
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

  it('locks plan-gated ranges in the dropdown', async () => {
    const user = userEvent.setup();
    render(
      <TimeRangeSelector
        variant='menu'
        value='30d'
        onValueChange={vi.fn()}
        ranges={['7d', '30d', '90d', 'all']}
        lockedRanges={['90d', 'all']}
      />
    );

    await user.click(
      screen.getByRole('button', { name: 'Analytics Time Range' })
    );

    const lockedItem = screen.getByRole('menuitem', { name: /All Time/ });
    expect(lockedItem).toHaveAttribute('aria-disabled', 'true');
  });
});
