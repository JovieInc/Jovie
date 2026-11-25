import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { AccountDashboard } from './AccountDashboard';

const keepInPage = vi.fn((event: Event) => event.preventDefault());

describe('AccountDashboard certificate', () => {
  beforeEach(() => {
    document.addEventListener('click', keepInPage);
  });

  afterEach(() => {
    document.removeEventListener('click', keepInPage);
    keepInPage.mockClear();
  });

  it('is axe-clean and tabs through every quick action in order', async () => {
    const user = userEvent.setup();
    const { container } = render(<AccountDashboard />);

    await user.tab();
    expect(screen.getByRole('link', { name: 'Manage Billing' })).toHaveFocus();
    await user.tab();
    expect(screen.getByRole('link', { name: 'Edit Profile' })).toHaveFocus();
    await expectNoA11yViolations(container);
  });

  it('activates a quick action link by click', async () => {
    const user = userEvent.setup();
    render(<AccountDashboard />);

    await user.click(screen.getByRole('link', { name: 'Contact Support' }));

    expect(keepInPage).toHaveBeenCalledOnce();
  });

  it('stays axe-clean in an Arabic document', async () => {
    const { container } = render(
      <div dir='rtl' lang='ar'>
        <AccountDashboard />
      </div>
    );

    expect(
      screen.getByRole('heading', { name: 'Account Settings' })
    ).toBeVisible();
    await expectNoA11yViolations(container);
  });
});
