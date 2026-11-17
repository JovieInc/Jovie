import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { WCAG_22_AA_TAGS } from '@/lib/a11y-gates/wcag-22-aa';
import type { ChangelogRelease } from '@/lib/changelog-parser';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { ChangelogTimeline } from './ChangelogTimeline';

const RELEASE: ChangelogRelease = {
  version: '26.7.0',
  kind: 'release',
  date: '2026-07-21',
  summary: 'A focused set of **public-facing** workflow improvements.',
  sections: {
    featured: [],
    added: ['**Release workspace:** keeps status and links together.'],
    changed: [],
    fixed: ['Compact layouts keep their labels visible.'],
    removed: [],
  },
};

function many(count: number): ChangelogRelease[] {
  return Array.from({ length: count }, (_, index) => ({
    ...RELEASE,
    version: `26.${count - index}.0`,
  }));
}

describe('ChangelogTimeline certificate', () => {
  it('renders a release with its summary and sections axe-clean', async () => {
    const { container } = render(<ChangelogTimeline releases={[RELEASE]} />);

    expect(screen.getAllByRole('article')).toHaveLength(1);
    expect(screen.getByText('public-facing')).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /More Update/ })
    ).not.toBeInTheDocument();
    await expectNoA11yViolations(container);
  });

  it('renders the empty state axe-clean', async () => {
    const { container } = render(<ChangelogTimeline releases={[]} />);

    expect(
      screen.getByText('No updates yet. Check back soon!')
    ).toBeInTheDocument();
    await expectNoA11yViolations(container);
  });

  it('reveals the remaining releases from the Show More control', async () => {
    const user = userEvent.setup();
    const { container } = render(<ChangelogTimeline releases={many(30)} />);

    expect(screen.getAllByRole('article')).toHaveLength(25);
    expect(screen.getByText('Showing 25 of 30 updates')).toBeInTheDocument();
    // Every release repeats its section names (New, Fixed and so on), which
    // the best-practice landmark-unique rule flags across releases. Hold this
    // state to the same WCAG 2.2 AA gate the Storybook a11y run enforces.
    await expectNoA11yViolations(container, {
      runOnly: { type: 'tag', values: [...WCAG_22_AA_TAGS] },
    });

    await user.click(
      screen.getByRole('button', { name: 'Show 5 More Updates' })
    );

    expect(screen.getAllByRole('article')).toHaveLength(30);
    expect(screen.getByText('Showing 30 of 30 updates')).toHaveFocus();
    expect(
      screen.queryByRole('button', { name: /More Update/ })
    ).not.toBeInTheDocument();
  });

  it('renders a partial, undated release without its entry chrome', async () => {
    const { container } = render(
      <ChangelogTimeline
        releases={[{ ...RELEASE, date: '', summary: '' }]}
        showEntryHeader={false}
      />
    );

    expect(screen.queryByRole('link')).not.toBeInTheDocument();
    expect(screen.getAllByRole('list').length).toBeGreaterThan(0);
    await expectNoA11yViolations(container);
  });

  it('renders an Arabic release right to left', async () => {
    const { container } = render(
      <div dir='rtl' lang='ar'>
        <ChangelogTimeline
          releases={[{ ...RELEASE, summary: 'مجموعة من التحسينات.' }]}
        />
      </div>
    );

    expect(screen.getByText('مجموعة من التحسينات.')).toBeInTheDocument();
    await expectNoA11yViolations(container);
  });
});
