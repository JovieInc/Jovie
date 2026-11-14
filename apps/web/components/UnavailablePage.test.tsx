import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { UnavailablePage } from './UnavailablePage';

describe('UnavailablePage', () => {
  it('shows one neutral heading and retry copy with a decorative mark, axe-clean', async () => {
    const { container } = render(<UnavailablePage />);

    expect(
      screen.getByRole('heading', {
        level: 1,
        name: 'Jovie Is Unavailable Right Now',
      })
    ).toBeInTheDocument();
    expect(screen.getByText('Please try again later.')).toBeInTheDocument();
    expect(container.querySelector('svg')).toHaveAttribute(
      'aria-hidden',
      'true'
    );

    // Blocked users get no account-level language, codes or way out.
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
    expect(container).not.toHaveTextContent(/ban|suspend|support|code/i);

    await expectNoA11yViolations(container);
  });
});
