import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { FeatureAccordion } from './FeatureAccordion';

const items = [
  { number: '3.1', title: 'Fan Intelligence', description: 'See who returns.' },
  { number: '3.2', title: 'Source Tracking', description: 'Know the source.' },
];

describe('FeatureAccordion', () => {
  it('renders nothing but the wrapper when there are no items', async () => {
    const { container } = render(<FeatureAccordion items={[]} />);

    expect(screen.queryByRole('button')).not.toBeInTheDocument();
    await expectNoA11yViolations(container);
  });

  it('starts collapsed and axe-clean', async () => {
    const { container } = render(<FeatureAccordion items={items} />);

    for (const button of screen.getAllByRole('button')) {
      expect(button).toHaveAttribute('aria-expanded', 'false');
    }
    expect(screen.queryByText('See who returns.')).not.toBeVisible();
    await expectNoA11yViolations(container);
  });

  it('opens one panel at a time and closes it on a second press', async () => {
    const user = userEvent.setup();
    const { container } = render(<FeatureAccordion items={items} />);
    const first = screen.getByRole('button', { name: /Fan Intelligence/ });
    const second = screen.getByRole('button', { name: /Source Tracking/ });

    await user.click(first);
    expect(first).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByText('See who returns.')).toBeVisible();
    await expectNoA11yViolations(container);

    await user.click(second);
    expect(first).toHaveAttribute('aria-expanded', 'false');
    expect(second).toHaveAttribute('aria-expanded', 'true');

    await user.click(second);
    expect(second).toHaveAttribute('aria-expanded', 'false');
  });
});
