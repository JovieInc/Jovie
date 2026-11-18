import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { WaitlistMetrics } from './WaitlistMetrics';

describe('WaitlistMetrics certificate', () => {
  it('keeps the status counts axe-clean', async () => {
    const { container } = render(
      <WaitlistMetrics
        metrics={{
          total: 1842,
          waitlisted: 1842,
          invited: 620,
          signedUp: 411,
          emailFailures: 7,
        }}
      />
    );

    expect(screen.getByText('620')).toBeInTheDocument();
    expect(screen.getByText('7')).toBeInTheDocument();
    await expectNoA11yViolations(container);
  });

  it('keeps large counts axe-clean inside an RTL document', async () => {
    const { container } = render(
      <div dir='rtl' lang='ar'>
        <WaitlistMetrics
          metrics={{
            total: 12_345_678,
            waitlisted: 9_876_543,
            invited: 1_234_567,
            signedUp: 987_654,
            emailFailures: 123_456,
          }}
        />
      </div>
    );

    expect(screen.getByText((9_876_543).toLocaleString())).toBeInTheDocument();
    expect(screen.getByText((123_456).toLocaleString())).toBeInTheDocument();
    await expectNoA11yViolations(container);
  });
});
