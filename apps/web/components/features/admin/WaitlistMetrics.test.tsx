import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { WaitlistMetrics } from './WaitlistMetrics';

describe('WaitlistMetrics', () => {
  it('pairs every status with its formatted count, including zero failures', () => {
    render(
      <WaitlistMetrics
        metrics={{
          total: 1297,
          waitlisted: 1234,
          invited: 56,
          signedUp: 7,
          emailFailures: 0,
        }}
      />
    );

    for (const [label, value] of [
      ['Waitlisted', (1234).toLocaleString()],
      ['Invited', '56'],
      ['Signed Up', '7'],
      ['Email Failures', '0'],
    ]) {
      const term = screen.getByText(label).closest('dt');
      const list = term?.closest('dl');
      expect(list).not.toBeNull();
      expect(within(list!).getByRole('definition')).toHaveTextContent(value);
    }
    expect(screen.getAllByRole('term')).toHaveLength(4);
  });
});
