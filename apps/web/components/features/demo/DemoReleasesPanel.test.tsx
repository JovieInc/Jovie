import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { DemoReleasesPanel } from './DemoReleasesPanel';
import { DEMO_RELEASES } from './demo-fixtures';

const groups = [
  { status: 'live' as const, releases: DEMO_RELEASES.slice(0, 2) },
  { status: 'draft' as const, releases: DEMO_RELEASES.slice(2, 3) },
];

describe('DemoReleasesPanel', () => {
  it('renders a labelled region with one listbox per expanded group', () => {
    render(
      <DemoReleasesPanel groups={groups} selectedId={null} onSelect={vi.fn()} />
    );
    expect(
      screen.getByRole('region', { name: 'Releases' })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('listbox', { name: 'Live releases' })
    ).toBeVisible();
    expect(
      screen.getByRole('listbox', { name: 'Draft releases' })
    ).toBeVisible();
  });

  it('collapses a group from a toggle with an sr-only purpose in its name', () => {
    render(
      <DemoReleasesPanel groups={groups} selectedId={null} onSelect={vi.fn()} />
    );
    fireEvent.click(
      screen.getByRole('button', { name: /Toggle releases section: Live/ })
    );
    expect(screen.queryByRole('listbox', { name: 'Live releases' })).toBeNull();
  });

  it('selects releases by click and keyboard', () => {
    const onSelect = vi.fn();
    render(
      <DemoReleasesPanel
        groups={groups}
        selectedId={DEMO_RELEASES[0].id}
        onSelect={onSelect}
      />
    );
    const options = screen.getAllByRole('option');
    expect(options[0]).toHaveAttribute('aria-selected', 'true');
    fireEvent.click(options[1]);
    expect(onSelect).toHaveBeenCalledWith(DEMO_RELEASES[1].id);

    const live = screen.getByRole('listbox', { name: 'Live releases' });
    fireEvent.keyDown(live, { key: 'Escape' });
    expect(onSelect).toHaveBeenLastCalledWith('');
  });

  it('has no axe violations when populated, collapsed or empty', async () => {
    const { container, rerender } = render(
      <DemoReleasesPanel groups={groups} selectedId={null} onSelect={vi.fn()} />
    );
    await expectNoA11yViolations(container);

    fireEvent.click(
      screen.getByRole('button', { name: /Toggle releases section: Live/ })
    );
    await expectNoA11yViolations(container);

    rerender(
      <DemoReleasesPanel groups={[]} selectedId={null} onSelect={vi.fn()} />
    );
    await expectNoA11yViolations(container);
  });
});
