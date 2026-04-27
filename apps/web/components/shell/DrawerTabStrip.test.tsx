import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { DrawerTabStrip } from './DrawerTabStrip';

type Tab = 'overview' | 'distribution' | 'activity';

const TABS = [
  { value: 'overview' as const, label: 'Overview' },
  { value: 'distribution' as const, label: 'Distribution' },
  { value: 'activity' as const, label: 'Activity' },
];

describe('DrawerTabStrip', () => {
  it('renders every tab label', () => {
    render(
      <DrawerTabStrip<Tab>
        tabs={TABS}
        active='overview'
        onChange={() => undefined}
      />
    );
    expect(screen.getByRole('tab', { name: 'Overview' })).toBeInTheDocument();
    expect(
      screen.getByRole('tab', { name: 'Distribution' })
    ).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Activity' })).toBeInTheDocument();
  });

  it('marks the active tab with aria-selected', () => {
    render(
      <DrawerTabStrip<Tab>
        tabs={TABS}
        active='distribution'
        onChange={() => undefined}
      />
    );
    expect(
      screen.getByRole('tab', { name: 'Distribution', selected: true })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('tab', { name: 'Overview', selected: false })
    ).toBeInTheDocument();
  });

  it('fires onChange with the clicked tab value', () => {
    const onChange = vi.fn();
    render(
      <DrawerTabStrip<Tab> tabs={TABS} active='overview' onChange={onChange} />
    );
    fireEvent.click(screen.getByRole('tab', { name: 'Activity' }));
    expect(onChange).toHaveBeenCalledWith('activity');
  });

  it('uses a sensible default aria-label on the tablist', () => {
    render(
      <DrawerTabStrip<Tab>
        tabs={TABS}
        active='overview'
        onChange={() => undefined}
      />
    );
    expect(
      screen.getByRole('tablist', { name: 'Drawer sections' })
    ).toBeInTheDocument();
  });
});
