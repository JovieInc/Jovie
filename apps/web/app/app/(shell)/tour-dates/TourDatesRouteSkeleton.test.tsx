import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { TourDatesRouteSkeleton } from './TourDatesRouteSkeleton';

describe('TourDatesRouteSkeleton', () => {
  it('fills the Tour Dates frame with the tour-shaped segment skeleton, axe-clean', async () => {
    const { container } = render(<TourDatesRouteSkeleton />);

    const frame = screen.getByTestId('tour-dates-route-skeleton');
    const region = within(frame).getByLabelText('Loading tour dates');
    expect(region).toHaveAttribute('aria-busy', 'true');
    expect(frame.querySelector('[data-skeleton-layout="tour"]')).not.toBeNull();

    await expectNoA11yViolations(container);
  });
});
