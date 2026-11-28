import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { AudienceEngagementBars } from './AudienceEngagementBars';

describe('AudienceEngagementBars certificate', () => {
  it.each([
    [0, 0],
    [1, 1],
    [45, 3],
    [100, 5],
    [180, 5],
    [-20, 0],
  ])('score %i lights %i of 5 bars and stays axe-clean', async (score, lit) => {
    const { container } = render(<AudienceEngagementBars score={score} />);
    const meter = screen.getByRole('img', { name: `Engagement ${lit} of 5` });
    expect(meter.querySelectorAll('.bg-success-text')).toHaveLength(lit);
    await expectNoA11yViolations(container);
  });

  it('renders inside an RTL document', async () => {
    const { container } = render(
      <div dir='rtl'>
        <AudienceEngagementBars score={60} />
      </div>
    );
    expect(
      screen.getByRole('img', { name: 'Engagement 3 of 5' })
    ).toBeInTheDocument();
    await expectNoA11yViolations(container);
  });
});
