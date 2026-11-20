import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';

vi.mock('@/components/atoms/InvisibleTurnstile', () => ({
  InvisibleTurnstile: () => <div data-testid='turnstile' />,
  isTurnstileClientBypassed: () => false,
  isTurnstileClientConfigured: () => true,
}));

import { ChangelogSubscribeColumn } from './ChangelogSubscribeColumn';

describe('ChangelogSubscribeColumn certificate', () => {
  it('renders the flush-start signup axe-clean and keeps typed input', async () => {
    const user = userEvent.setup();
    const { container } = render(<ChangelogSubscribeColumn />);

    expect(
      screen.getByRole('heading', { name: 'Get updates' })
    ).toBeInTheDocument();
    await expectNoA11yViolations(container);

    const field = screen.getByRole('textbox');
    await user.type(field, 'fan@example.com');
    expect(field).toHaveValue('fan@example.com');
    expect(screen.getByTestId('turnstile')).toBeInTheDocument();
    await expectNoA11yViolations(container);
  });

  it('stays axe-clean in a right-to-left document', async () => {
    const { container } = render(
      <div dir='rtl' lang='ar'>
        <ChangelogSubscribeColumn />
      </div>
    );

    expect(container.querySelector('.changelog-subscribe')).not.toBeNull();
    await expectNoA11yViolations(container);
  });
});
