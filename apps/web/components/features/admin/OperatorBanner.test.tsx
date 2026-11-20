import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { OperatorBanner } from './OperatorBanner';

vi.mock('@/lib/env-client', () => ({ env: { IS_E2E: false } }));
vi.mock('@/lib/queries', () => ({
  useEnvHealthQuery: () => ({ data: undefined }),
}));

describe('OperatorBanner', () => {
  beforeEach(() => {
    sessionStorage.clear();
  });

  it('renders issues on the Noir surface tokens, not raw amber', () => {
    render(<OperatorBanner initialIssues={['A missing', 'B missing', 'C']} />);
    const banner = screen.getByRole('alert');
    expect(banner).toHaveTextContent('A missing; B missing');
    expect(banner).toHaveClass('bg-surface-2', 'text-primary-token');
    expect(banner.className).not.toMatch(/amber-/);
    expect(screen.getByText('+1 more')).toHaveClass('text-secondary-token');
  });

  it('dismisses for the session', () => {
    render(<OperatorBanner initialIssues={['A missing']} />);
    fireEvent.click(
      screen.getByRole('button', { name: 'Dismiss Environment Warning' })
    );
    expect(screen.queryByRole('alert')).toBeNull();
    expect(sessionStorage.getItem('operator-banner-dismissed')).toBe('true');
  });

  it('renders nothing without issues', () => {
    render(<OperatorBanner />);
    expect(screen.queryByTestId('operator-banner')).toBeNull();
  });

  it('has no axe violations while showing issues', async () => {
    const { container } = render(
      <OperatorBanner
        initialIssues={['STRIPE_SECRET_KEY is invalid', 'DATABASE_URL failed']}
      />
    );
    expect(screen.getByRole('alert')).toBeInTheDocument();
    await expectNoA11yViolations(container);
  });

  it('keeps long issue lists to two entries plus an overflow count', async () => {
    const issues = Array.from(
      { length: 6 },
      (_, i) => `ISSUE_${i}_${'X'.repeat(80)} is misconfigured`
    );
    const { container } = render(<OperatorBanner initialIssues={issues} />);
    const banner = screen.getByRole('alert');
    expect(banner).toHaveTextContent(`${issues[0]}; ${issues[1]}`);
    expect(banner).not.toHaveTextContent(issues[2]);
    expect(screen.getByText('+4 more')).toBeInTheDocument();
    await expectNoA11yViolations(container);
  });

  it('renders right-to-left issue text accessibly', async () => {
    const { container } = render(
      <div dir='rtl' lang='ar'>
        <OperatorBanner initialIssues={['مفتاح الدفع السري مفقود']} />
      </div>
    );
    expect(screen.getByRole('alert')).toHaveTextContent(
      'مفتاح الدفع السري مفقود'
    );
    await expectNoA11yViolations(container);
  });

  it('stays hidden for the session once dismissed', async () => {
    sessionStorage.setItem('operator-banner-dismissed', 'true');
    const { container } = render(<OperatorBanner initialIssues={['A']} />);
    expect(screen.queryByRole('alert')).toBeNull();
    await expectNoA11yViolations(container);
  });
});
