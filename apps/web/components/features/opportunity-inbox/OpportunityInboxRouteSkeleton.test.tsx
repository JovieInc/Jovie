import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import {
  OpportunityInboxLoadingCards,
  OpportunityInboxRouteSkeleton,
} from './OpportunityInboxRouteSkeleton';

describe('OpportunityInboxRouteSkeleton', () => {
  it('announces a busy Inbox and draws placeholder cards for Needs You', () => {
    render(<OpportunityInboxRouteSkeleton />);
    expect(screen.getByLabelText('Loading Inbox')).toHaveAttribute(
      'aria-busy',
      'true'
    );
    const queue = screen.getByTestId('opportunity-inbox-loading');
    expect(queue).toHaveAttribute('role', 'status');
    expect(within(queue).getByText('Loading Your Inbox')).toHaveClass(
      'sr-only'
    );
    expect(
      within(queue).getAllByTestId('opportunity-inbox-loading-card')
    ).toHaveLength(3);
  });

  it('uses the loaded page frame so cards fill in without a layout swap', () => {
    render(<OpportunityInboxRouteSkeleton />);
    expect(
      screen
        .getByTestId('opportunity-inbox-route-skeleton')
        .querySelector('.system-b-opportunity-inbox-page')
    ).not.toBeNull();
  });

  it('renders only design-system skeleton blocks, with no interactive controls', () => {
    const { container } = render(<OpportunityInboxLoadingCards />);
    expect(screen.queryAllByRole('button')).toHaveLength(0);
    expect(
      container.querySelectorAll('[data-slot="skeleton"]').length
    ).toBeGreaterThan(0);
  });

  it('holds no visible text, only its announced label', () => {
    render(<OpportunityInboxRouteSkeleton />);
    const region = screen.getByTestId('opportunity-inbox-route-skeleton');
    expect(region.textContent).toBe('Loading Your Inbox');
  });

  it.each(['ltr', 'rtl'] as const)('is axe-clean in %s', async dir => {
    const { container } = render(
      <main dir={dir}>
        <OpportunityInboxRouteSkeleton />
      </main>
    );
    await expectNoA11yViolations(container);
  });
});
