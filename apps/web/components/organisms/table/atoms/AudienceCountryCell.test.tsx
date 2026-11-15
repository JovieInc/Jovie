import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { AudienceCountryCell } from './AudienceCountryCell';

describe('AudienceCountryCell', () => {
  it('shows the upper-cased two-letter code', async () => {
    const { container } = render(<AudienceCountryCell geoCountry='gb' />);

    expect(screen.getByText('GB')).toBeInTheDocument();
    await expectNoA11yViolations(container);
  });

  it.each([null, '1x'])('shows Unknown for %s', async geoCountry => {
    const { container } = render(
      <AudienceCountryCell geoCountry={geoCountry} className='custom' />
    );

    expect(screen.getByText('Unknown')).toBeInTheDocument();
    expect(container.firstElementChild).toHaveClass('custom');
    await expectNoA11yViolations(container);
  });

  it('keeps the decorative pin hidden in an RTL document', async () => {
    const { container } = render(
      <div dir='rtl'>
        <AudienceCountryCell geoCountry='AE' />
      </div>
    );

    expect(screen.getByText('AE')).toBeInTheDocument();
    expect(container.querySelector('svg')).toHaveAttribute(
      'aria-hidden',
      'true'
    );
    await expectNoA11yViolations(container);
  });
});
