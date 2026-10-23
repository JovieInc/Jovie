import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { DemoReleasesPanel } from './DemoReleasesPanel';
import { DEMO_RELEASES } from './demo-fixtures';

describe('DemoReleasesPanel accessible controls', () => {
  it('moves focus between release buttons before native keyboard activation', async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    const releases = DEMO_RELEASES.slice(0, 2);
    render(
      <DemoReleasesPanel
        groups={[{ status: 'live', releases }]}
        selectedId={null}
        onSelect={onSelect}
      />
    );
    const first = screen.getByRole('button', {
      name: new RegExp(releases[0].title),
    });
    const second = screen.getByRole('button', {
      name: new RegExp(releases[1].title),
    });
    second.scrollIntoView = vi.fn();
    first.focus();
    await user.keyboard('{ArrowDown}');
    expect(second).toHaveFocus();
    expect(onSelect).not.toHaveBeenCalled();
    await user.keyboard('{Enter}');
    expect(onSelect).toHaveBeenCalledExactlyOnceWith(releases[1].id);
  });

  it('selects a release once from the keyboard and exposes its selected state', async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    const release = DEMO_RELEASES[0];
    render(
      <DemoReleasesPanel
        groups={[{ status: 'live', releases: [release] }]}
        selectedId={release.id}
        onSelect={onSelect}
      />
    );

    const row = screen.getByRole('button', {
      name: new RegExp(release.title),
    });
    expect(row).toHaveAttribute('aria-pressed', 'true');
    row.focus();
    await user.keyboard('{Enter}');
    expect(onSelect).toHaveBeenCalledExactlyOnceWith(release.id);

    const toggle = screen.getByRole('button', { name: /Toggle.*Live.*1/ });
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    await user.click(toggle);
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(row).not.toBeInTheDocument();
  });
});
