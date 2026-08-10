import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { ChangelogRelease } from '@/lib/changelog-parser';
import { ChangelogTimeline } from './ChangelogTimeline';

const RELEASES: readonly ChangelogRelease[] = [
  {
    version: '26.8.0',
    date: '2026-08-09',
    summary: 'A **deterministic release with `/pitch`** and `inline code`.',
    sections: {
      added: ['**New workspace:** Review `release:status`.'],
      changed: ['One canonical navigation model.'],
      fixed: ['Stable compact layout.', 'Stable compact layout.'],
      removed: [
        'A duplicate route-local control.',
        '<img src=x onerror=alert(1)>',
      ],
    },
  },
];

describe('ChangelogTimeline', () => {
  it('renders the deterministic release state and every populated section', () => {
    const { container } = render(<ChangelogTimeline releases={RELEASES} />);

    expect(screen.getByText('v26.8.0')).toBeVisible();
    expect(screen.getByText('Aug 9, 2026')).toBeVisible();
    expect(
      screen.getByText('deterministic release with', { exact: false })
    ).toBeVisible();
    expect(screen.getByText('/pitch', { selector: 'code' })).toBeVisible();
    expect(screen.getByText('/pitch').closest('strong')).toBeVisible();
    expect(screen.getByText('inline code', { selector: 'code' })).toBeVisible();
    expect(
      screen.getByText('New workspace:', { selector: 'strong' })
    ).toBeVisible();
    expect(
      screen.getByText('release:status', { selector: 'code' })
    ).toBeVisible();
    expect(screen.getByText('New')).toBeVisible();
    expect(screen.getByText('Improved')).toBeVisible();
    expect(screen.getByText('Fixed')).toBeVisible();
    expect(screen.getByText('Removed')).toBeVisible();
    expect(screen.getAllByText('Stable compact layout.')).toHaveLength(2);
    expect(container).not.toHaveTextContent('**');
    expect(container).not.toHaveTextContent('`');
    expect(container.querySelector('img')).not.toBeInTheDocument();
    expect(screen.getByText('<img src=x onerror=alert(1)>')).toBeVisible();
    expect(container.firstElementChild).toHaveAttribute(
      'data-reduced-motion',
      'static'
    );
    expect(screen.getByText('v26.8.0').closest('span')).toHaveClass(
      'motion-reduce:transition-none'
    );
  });

  it('renders the production empty state without release chrome', () => {
    render(<ChangelogTimeline releases={[]} />);

    expect(screen.getByText('No updates yet. Check back soon!')).toBeVisible();
    expect(screen.queryByText(/^v/)).not.toBeInTheDocument();
  });

  it('bounds the initial release list and progressively exposes every update', () => {
    const releases = Array.from({ length: 23 }, (_, index) => ({
      ...RELEASES[0],
      version: `26.8.${23 - index}`,
      date: `2026-08-${String(23 - index).padStart(2, '0')}`,
    }));
    const { container } = render(<ChangelogTimeline releases={releases} />);

    expect(container.querySelectorAll('article')).toHaveLength(10);
    expect(
      screen.getByRole('button', { name: 'Show 10 More Updates' })
    ).toBeVisible();
    expect(screen.queryByText('v26.8.1')).not.toBeInTheDocument();

    fireEvent.click(
      screen.getByRole('button', { name: 'Show 10 More Updates' })
    );
    expect(container.querySelectorAll('article')).toHaveLength(20);
    expect(
      screen.getByRole('button', { name: 'Show 3 More Updates' })
    ).toBeVisible();

    fireEvent.click(
      screen.getByRole('button', { name: 'Show 3 More Updates' })
    );
    expect(container.querySelectorAll('article')).toHaveLength(23);
    expect(screen.getByText('v26.8.1')).toBeVisible();
    expect(screen.getByText('Showing 23 of 23 updates')).toBeVisible();
    expect(screen.queryByRole('button', { name: /More Updates/ })).toBeNull();
  });
});
