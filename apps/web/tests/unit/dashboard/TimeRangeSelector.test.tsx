import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { TimeRangeSelector } from '@/components/molecules/TimeRangeSelector';

type SegmentRange = '1d' | '7d' | '30d' | '90d';

function ControlledSegmentRange({
  onValueChange,
}: {
  readonly onValueChange: (range: SegmentRange) => void;
}) {
  const [value, setValue] = useState<SegmentRange>('1d');
  return (
    <TimeRangeSelector
      value={value}
      onValueChange={range => {
        setValue(range);
        onValueChange(range);
      }}
      ranges={['1d', '7d', '30d', '90d']}
      lockedRanges={['7d']}
      maxRetentionDays={30}
    />
  );
}

describe('TimeRangeSelector (segment variant)', () => {
  it('exposes a named single choice without empty tab panels', () => {
    render(
      <TimeRangeSelector
        value='7d'
        onValueChange={vi.fn()}
        ranges={['1d', '7d', '30d']}
      />
    );

    expect(
      screen.getByRole('radiogroup', { name: 'Analytics Time Range' })
    ).toBeVisible();
    expect(screen.getAllByRole('radio')).toHaveLength(3);
    expect(screen.getByRole('radio', { name: '7D' })).toBeChecked();
    expect(screen.queryByRole('tablist')).not.toBeInTheDocument();
    expect(
      screen.queryByRole('tabpanel', { hidden: true })
    ).not.toBeInTheDocument();
  });

  it('selects an enabled range once and keeps locked ranges unavailable', async () => {
    const user = userEvent.setup();
    const onValueChange = vi.fn();
    render(<ControlledSegmentRange onValueChange={onValueChange} />);

    const chosen = screen.getByRole('radio', { name: '30D' });
    await user.click(chosen);
    expect(chosen).toBeChecked();
    expect(chosen).toHaveFocus();
    expect(screen.getByRole('radio', { name: '1D' })).not.toBeChecked();
    expect(onValueChange).toHaveBeenCalledTimes(1);
    expect(onValueChange).toHaveBeenLastCalledWith('30d');

    for (const name of ['7D', '90D']) {
      const locked = screen.getByRole('radio', { name });
      expect(locked).toBeDisabled();
      await user.click(locked);
    }
    expect(chosen).toBeChecked();
    expect(onValueChange).toHaveBeenCalledTimes(1);
  });

  it('skips disabled ranges and supports keyboard focus and selection', async () => {
    const user = userEvent.setup();
    const onValueChange = vi.fn();
    render(<ControlledSegmentRange onValueChange={onValueChange} />);
    const first = screen.getByRole('radio', { name: '1D' });
    const last = screen.getByRole('radio', { name: '30D' });

    await user.tab();
    expect(first).toHaveFocus();
    // Radix checks arrow-focused items while the arrow key is held.
    await user.keyboard('{ArrowRight>}');
    await waitFor(() => expect(last).toHaveFocus());
    await user.keyboard('{/ArrowRight}');
    expect(last).toBeChecked();
    expect(onValueChange).toHaveBeenCalledTimes(1);
    expect(onValueChange).toHaveBeenLastCalledWith('30d');

    await user.keyboard('{Home}');
    await waitFor(() => expect(first).toHaveFocus());
    await user.keyboard(' ');
    expect(first).toBeChecked();
    expect(onValueChange).toHaveBeenCalledTimes(2);
    expect(onValueChange).toHaveBeenLastCalledWith('1d');

    await user.keyboard('{End}');
    await waitFor(() => expect(last).toHaveFocus());
    await user.keyboard(' ');
    expect(last).toBeChecked();
    expect(onValueChange).toHaveBeenCalledTimes(3);
    expect(onValueChange).toHaveBeenLastCalledWith('30d');
  });
});

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
    const shell = tablist.parentElement;
    const activeTab = screen.getByRole('tab', { name: '7D' });

    expect(shell).toHaveClass('rounded-full');
    expect(shell).toHaveAttribute('data-variant', 'default');
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
      <>
        <TimeRangeSelector
          variant='tabs'
          value='7d'
          onValueChange={vi.fn()}
          ranges={['1d', '7d', '30d']}
          tabsBaseId='analytics'
          panelId='analytics-panel'
        />
        <div
          id='analytics-panel'
          role='tabpanel'
          aria-labelledby='analytics-tab-7d'
        >
          Current analytics results
        </div>
      </>
    );
    expect(screen.getByRole('tabpanel', { name: '7D' })).toHaveAttribute(
      'id',
      'analytics-panel'
    );
    expect(screen.queryByRole('radiogroup')).not.toBeInTheDocument();

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
      'Upgrade to Artist Presence for extended analytics'
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
