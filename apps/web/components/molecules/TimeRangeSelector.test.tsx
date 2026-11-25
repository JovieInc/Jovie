import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { TimeRangeSelector } from './TimeRangeSelector';

describe('TimeRangeSelector', () => {
  it('selects a range from the segment variant', async () => {
    const user = userEvent.setup();
    const onValueChange = vi.fn();
    const { container } = render(
      <TimeRangeSelector value='7d' onValueChange={onValueChange} />
    );

    await expectNoA11yViolations(container);
    const radios = screen.getAllByRole('radio');
    expect(radios).toHaveLength(2);

    await user.click(radios[1]);

    expect(onValueChange).toHaveBeenCalledWith('30d');
  });

  it('disables ranges past the plan retention', async () => {
    const { container } = render(
      <TimeRangeSelector
        value='7d'
        onValueChange={vi.fn()}
        ranges={['7d', '30d', '90d']}
        maxRetentionDays={30}
      />
    );

    const radios = screen.getAllByRole('radio');
    expect(radios[2]).toBeDisabled();
    expect(radios[1]).not.toBeDisabled();
    await expectNoA11yViolations(container);
  });

  it('wires the tabs variant to its panel', async () => {
    const user = userEvent.setup();
    const onValueChange = vi.fn();
    const { container } = render(
      <>
        <TimeRangeSelector
          value='7d'
          onValueChange={onValueChange}
          variant='tabs'
          tabsBaseId='range'
          panelId='range-panel'
        />
        <div id='range-panel' role='tabpanel' aria-label='Analytics' />
      </>
    );

    const tabs = screen.getAllByRole('tab');
    expect(tabs[0]).toHaveAttribute('aria-controls', 'range-panel');
    await user.click(tabs[1]);

    expect(onValueChange).toHaveBeenCalledWith('30d');
    await expectNoA11yViolations(container);
  });

  it('opens the menu variant and picks an enabled range but not a locked one', async () => {
    const user = userEvent.setup();
    const onValueChange = vi.fn();
    const { container } = render(
      <TimeRangeSelector
        value='7d'
        onValueChange={onValueChange}
        variant='menu'
        ranges={['7d', '30d', '90d']}
        lockedRanges={['90d']}
      />
    );

    await expectNoA11yViolations(container);
    await user.click(
      screen.getByRole('button', { name: 'Analytics Time Range' })
    );
    const items = await screen.findAllByRole('menuitem');
    expect(items[2]).toHaveAttribute('aria-disabled', 'true');

    await user.click(items[1]);

    expect(onValueChange).toHaveBeenCalledWith('30d');
  });
});
