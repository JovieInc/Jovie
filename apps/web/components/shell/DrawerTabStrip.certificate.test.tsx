import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { DrawerTabStrip } from './DrawerTabStrip';

type Tab = 'overview' | 'distribution';
const TABS = [
  { value: 'overview' as const, label: 'Overview' },
  { value: 'distribution' as const, label: 'Distribution' },
];

describe('DrawerTabStrip certificate', () => {
  it('selects tabs by click and keyboard and marks the active one, axe-clean', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    const { container } = render(
      <DrawerTabStrip<Tab>
        tabs={TABS}
        active='overview'
        onChange={onChange}
        ariaLabel='Release sections'
      />
    );

    expect(
      screen.getByRole('tablist', { name: 'Release sections' })
    ).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Overview' })).toHaveAttribute(
      'aria-selected',
      'true'
    );
    await user.click(screen.getByRole('tab', { name: 'Distribution' }));
    expect(onChange).toHaveBeenCalledWith('distribution');
    screen.getByRole('tab', { name: 'Overview' }).focus();
    await user.keyboard('{Enter}');
    expect(onChange).toHaveBeenLastCalledWith('overview');
    await expectNoA11yViolations(container);
  });

  it('renders an empty strip and a right-to-left strip axe-clean', async () => {
    const empty = render(
      <DrawerTabStrip<Tab> tabs={[]} active='overview' onChange={vi.fn()} />
    );
    expect(screen.queryAllByRole('tab')).toHaveLength(0);
    await expectNoA11yViolations(empty.container);
    empty.unmount();

    const { container } = render(
      <div dir='rtl'>
        <DrawerTabStrip<Tab>
          tabs={[{ value: 'overview', label: 'نظرة عامة' }]}
          active='overview'
          onChange={vi.fn()}
          className='custom'
        />
      </div>
    );
    expect(screen.getByRole('tab', { name: 'نظرة عامة' })).toBeInTheDocument();
    expect(container.querySelector('.custom')).not.toBeNull();
    await expectNoA11yViolations(container);
  });
});
