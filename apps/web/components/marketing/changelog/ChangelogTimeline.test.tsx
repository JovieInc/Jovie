import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { ChangelogRelease } from '@/lib/changelog-parser';
import { ChangelogTimeline } from './ChangelogTimeline';

const RELEASES: readonly ChangelogRelease[] = [
  {
    version: '26.8.0',
    date: '2026-08-09',
    summary: 'A **deterministic** release with `inline code`.',
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
      screen.getByText('deterministic', { selector: 'strong' })
    ).toBeVisible();
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
});
