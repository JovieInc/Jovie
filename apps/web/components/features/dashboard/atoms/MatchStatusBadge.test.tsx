import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { MatchStatusBadge } from './MatchStatusBadge';

describe('MatchStatusBadge certificate', () => {
  it.each([
    ['suggested', 'Suggested'],
    ['confirmed', 'Confirmed'],
    ['auto_confirmed', 'Auto-confirmed'],
    ['rejected', 'Rejected'],
  ] as const)('labels the %s status', async (status, label) => {
    const { container } = render(
      <MatchStatusBadge status={status} className='extra' />
    );

    expect(screen.getByText(label).closest('.extra')).not.toBeNull();
    await expectNoA11yViolations(container);
  });

  it('renders the small size with the same label', async () => {
    const { container, rerender } = render(
      <MatchStatusBadge status='confirmed' />
    );
    const mdClass = container.firstElementChild?.className;
    rerender(<MatchStatusBadge status='confirmed' size='sm' />);

    expect(screen.getByText('Confirmed')).toBeInTheDocument();
    expect(container.firstElementChild?.className).not.toBe(mdClass);
    await expectNoA11yViolations(container);
  });

  it('stays accessible beside right-to-left copy', async () => {
    const { container } = render(
      <div dir='rtl'>
        <span>حالة المطابقة</span>
        <MatchStatusBadge status='auto_confirmed' />
      </div>
    );

    expect(screen.getByText('Auto-confirmed')).toBeInTheDocument();
    await expectNoA11yViolations(container);
  });
});
