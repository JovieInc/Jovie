import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { TourDatesPageFrame } from './TourDatesPageFrame';

describe('TourDatesPageFrame', () => {
  it('wraps its children in the tagged page frame, axe-clean', async () => {
    const { container } = render(
      <TourDatesPageFrame testId='tour-dates-page'>
        <h1>Tour Dates</h1>
        <p>Madison Square Garden, New York</p>
      </TourDatesPageFrame>
    );

    const frame = screen.getByTestId('tour-dates-page');
    expect(frame).toContainElement(
      screen.getByRole('heading', { name: 'Tour Dates' })
    );
    expect(frame).toHaveTextContent('Madison Square Garden, New York');

    await expectNoA11yViolations(container);
  });

  it('keeps long and right-to-left content inside the frame, axe-clean', async () => {
    const venue =
      'The Grand Riverside Amphitheatre and Waterfront Festival Grounds, Main Stage North';
    const { container } = render(
      <div dir='rtl' lang='ar'>
        <TourDatesPageFrame testId='tour-dates-rtl'>
          <h1>مواعيد الجولة</h1>
          <p>{venue}</p>
          <p>دار أوبرا دبي</p>
        </TourDatesPageFrame>
      </div>
    );

    const frame = screen.getByTestId('tour-dates-rtl');
    expect(frame).toHaveTextContent(venue);
    expect(frame).toHaveTextContent('دار أوبرا دبي');

    await expectNoA11yViolations(container);
  });
});
