import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { DemoReleasesPanel } from './DemoReleasesPanel';
import { DEMO_RELEASES } from './demo-fixtures';

describe('DemoReleasesPanel accessible controls', () => {
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
