import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { getComparison } from '@/content/comparisons';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { ComparisonPageContent } from './ComparisonPageContent';

vi.mock('@/lib/analytics', () => ({ track: vi.fn(), page: vi.fn() }));

const data = getComparison('linktree');

if (!data) {
  throw new Error('Missing canonical linktree comparison fixture');
}

describe('ComparisonPageContent certificate', () => {
  it('renders the checked-in comparison axe-clean', async () => {
    const { container } = render(<ComparisonPageContent data={data} />);

    const table = screen.getByRole('table');
    expect(within(table).getAllByRole('row')).toHaveLength(
      data.features.length + 1
    );
    expect(
      screen.getByRole('columnheader', { name: data.competitor })
    ).toBeVisible();
    await expectNoA11yViolations(container);
  });

  it('opens a question and moves between questions with the arrow keys', async () => {
    const user = userEvent.setup();
    const { container } = render(<ComparisonPageContent data={data} />);
    const [first, second] = data.faq;
    const firstTrigger = screen.getByRole('button', { name: first.question });

    await user.click(firstTrigger);
    expect(firstTrigger).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByText(first.answer)).toBeVisible();
    await expectNoA11yViolations(container);

    await user.keyboard('{ArrowDown}');
    expect(screen.getByRole('button', { name: second.question })).toHaveFocus();

    await user.click(firstTrigger);
    expect(firstTrigger).toHaveAttribute('aria-expanded', 'false');
  });

  it('renders an empty matrix and no questions axe-clean', async () => {
    const { container } = render(
      <ComparisonPageContent data={{ ...data, features: [], faq: [] }} />
    );

    expect(within(screen.getByRole('table')).getAllByRole('row')).toHaveLength(
      1
    );
    expect(
      screen.queryByRole('button', { name: data.faq[0].question })
    ).not.toBeInTheDocument();
    await expectNoA11yViolations(container);
  });

  it('keeps long copy inside a right-to-left document axe-clean', async () => {
    const headline = 'Jovie vs Linktree for artists who release often. '.repeat(
      3
    );
    const { container } = render(
      <div dir='rtl'>
        <ComparisonPageContent
          data={{ ...data, heroHeadline: headline.trim() }}
        />
      </div>
    );

    expect(
      screen.getByRole('heading', { level: 1, name: headline.trim() })
    ).toBeVisible();
    await expectNoA11yViolations(container);
  });
});
