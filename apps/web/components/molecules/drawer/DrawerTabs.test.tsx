import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { DrawerTabs } from './DrawerTabs';

const OPTIONS = [
  { value: 'details', label: 'Details' },
  { value: 'activity', label: 'Activity' },
  { value: 'sources', label: 'Sources' },
] as const;

type TabValue = (typeof OPTIONS)[number]['value'];

function ControlledTabs({
  onChange,
}: {
  readonly onChange?: (value: TabValue) => void;
}) {
  const [value, setValue] = useState<TabValue>('details');
  return (
    <DrawerTabs
      value={value}
      onValueChange={next => {
        setValue(next);
        onChange?.(next);
      }}
      options={OPTIONS}
      ariaLabel='Entity tabs'
      overflowMode='scroll'
    />
  );
}

describe('DrawerTabs', () => {
  it('names the tab list and marks the selected tab', async () => {
    const { container } = render(<ControlledTabs />);

    expect(screen.getByRole('tablist', { name: 'Entity tabs' })).toBeVisible();
    expect(screen.getByRole('tab', { name: 'Details' })).toHaveAttribute(
      'aria-selected',
      'true'
    );
    expect(screen.getByRole('tab', { name: 'Activity' })).toHaveAttribute(
      'aria-selected',
      'false'
    );
    await expectNoA11yViolations(container);
  });

  it('switches tabs on click and reports the new value', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    const { container } = render(<ControlledTabs onChange={onChange} />);

    await user.click(screen.getByRole('tab', { name: 'Sources' }));

    expect(onChange).toHaveBeenCalledWith('sources');
    expect(screen.getByRole('tab', { name: 'Sources' })).toHaveAttribute(
      'aria-selected',
      'true'
    );
    expect(screen.getByRole('tab', { name: 'Details' })).toHaveAttribute(
      'aria-selected',
      'false'
    );
    await expectNoA11yViolations(container);
  });

  it('renders trailing actions beside the tabs', async () => {
    const { container } = render(
      <DrawerTabs
        value='details'
        onValueChange={() => undefined}
        options={OPTIONS}
        ariaLabel='Entity tabs'
        actions={<span>Last 28 days</span>}
      />
    );

    expect(screen.getByText('Last 28 days')).toBeInTheDocument();
    expect(screen.getByRole('tablist', { name: 'Entity tabs' })).toBeVisible();
    await expectNoA11yViolations(container);
  });
});
