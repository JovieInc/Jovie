import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { AudienceTouringBadge } from './AudienceTouringBadge';

describe('AudienceTouringBadge', () => {
  it('shows the city and a title naming the show, axe-clean', async () => {
    const { container } = render(
      <AudienceTouringBadge
        touringCity='Austin, TX'
        showDate='2026-11-14T12:00:00Z'
      />
    );

    expect(screen.getByText('Austin, TX')).toBeInTheDocument();
    expect(
      screen.getByTitle(/^Upcoming show in Austin, TX on Nov \d+$/)
    ).toBeInTheDocument();
    await expectNoA11yViolations(container);
  });

  it('omits the date from the title when there is none', async () => {
    const { container } = render(
      <AudienceTouringBadge
        touringCity='Austin, TX'
        showDate={null}
        className='custom'
      />
    );

    expect(screen.getByTitle('Upcoming show in Austin, TX')).toHaveClass(
      'custom'
    );
    await expectNoA11yViolations(container);
  });

  it('renders nothing without a touring city', async () => {
    const { container } = render(
      <AudienceTouringBadge touringCity={null} showDate='2026-11-14' />
    );

    expect(container).toBeEmptyDOMElement();
    await expectNoA11yViolations(container);
  });

  it('renders a long city in a right-to-left row', async () => {
    const { container } = render(
      <div dir='rtl'>
        <AudienceTouringBadge
          touringCity='Llanfairpwllgwyngyllgogerychwyrndrobwllllantysiliogogogoch'
          showDate={null}
        />
      </div>
    );

    expect(screen.getByText(/^Llanfair/)).toHaveClass('truncate');
    await expectNoA11yViolations(container);
  });
});
