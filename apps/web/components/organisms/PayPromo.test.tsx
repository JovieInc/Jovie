import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import PayPromo from './PayPromo';

describe('PayPromo', () => {
  it('links the call to action to the live pay page and stays axe-clean', async () => {
    const user = userEvent.setup();
    const { container } = render(<PayPromo />);

    const cta = screen.getByRole('link', { name: /see it live/i });
    expect(cta).toHaveAttribute('href', '/tim/pay');
    await user.tab();
    expect(cta).toHaveFocus();
    expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent(
      'Pay, instantly.'
    );
    await expectNoA11yViolations(container);
  });

  it('stays axe-clean in a right-to-left page', async () => {
    const { container } = render(
      <div dir='rtl'>
        <PayPromo />
      </div>
    );

    expect(screen.getByText(/just pure support/i)).toBeInTheDocument();
    await expectNoA11yViolations(container);
  });
});
