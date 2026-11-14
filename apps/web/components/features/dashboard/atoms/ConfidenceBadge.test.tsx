import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { ConfidenceBadge, getConfidenceLevel } from './ConfidenceBadge';

describe('ConfidenceBadge', () => {
  it.each([
    [0.8, 'high'],
    [0.79, 'medium'],
    [0.5, 'medium'],
    [0.49, 'low'],
  ] as const)('classifies %s as %s', (score, level) => {
    expect(getConfidenceLevel(score)).toBe(level);
  });

  it.each([
    [0.92, '92%', 'High'],
    [0.65, '65%', 'Medium'],
    [0.2, '20%', 'Low'],
  ])('shows %s as %s with the %s label', async (score, pct, label) => {
    const { container } = render(<ConfidenceBadge score={score} showLabel />);
    expect(screen.getByText(pct)).toBeInTheDocument();
    expect(screen.getByText(label)).toBeInTheDocument();
    expect(screen.getByTitle(`${pct} confidence`)).toBeInTheDocument();
    await expectNoA11yViolations(container);
  });

  it('leaves the level label out unless asked', async () => {
    const { container } = render(<ConfidenceBadge score={0.92} size='sm' />);
    expect(screen.getByText('92%')).toBeInTheDocument();
    expect(screen.queryByText('High')).toBeNull();
    await expectNoA11yViolations(container);
  });

  it('stays accessible right to left', async () => {
    const { container } = render(
      <div dir='rtl' lang='ar'>
        <ConfidenceBadge score={0.65} showLabel />
      </div>
    );
    expect(screen.getByText('Medium')).toBeInTheDocument();
    await expectNoA11yViolations(container);
  });
});
