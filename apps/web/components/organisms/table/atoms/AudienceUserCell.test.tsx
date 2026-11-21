import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { AudienceUserCell } from './AudienceUserCell';

describe('AudienceUserCell', () => {
  it('shows the display name of an identified member', async () => {
    const { container } = render(
      <AudienceUserCell displayName='Jamie Rivera' type='email' />
    );

    expect(screen.getByText('Jamie Rivera')).toHaveClass('font-caption');
    await expectNoA11yViolations(container);
  });

  it('falls back to a generic label when the name is missing', async () => {
    const { container } = render(
      <AudienceUserCell displayName={null} type='sms' />
    );

    expect(container.querySelector('span.truncate')?.textContent).toBeTruthy();
    await expectNoA11yViolations(container);
  });

  it.each([
    [{ deviceType: 'mobile', geoCity: 'Austin' }, 'Mobile visitor from Austin'],
    [{ deviceType: 'tablet' }, 'Tablet visitor'],
    [
      { deviceType: 'robot', geoCountry: 'New%20Zealand' },
      'Unknown visitor from New Zealand',
    ],
  ])('describes an anonymous visitor %j', async (props, label) => {
    const { container } = render(
      <AudienceUserCell displayName={null} type='anonymous' {...props} />
    );

    expect(screen.getByText(label)).toBeInTheDocument();
    await expectNoA11yViolations(container);
  });

  it('flags bots and shows the type dot only for identified members', async () => {
    const { container, rerender } = render(
      <AudienceUserCell
        displayName='Crawler'
        type='spotify'
        tags={['bot']}
        showTypeDot
      />
    );

    expect(screen.getByText('Bot')).toBeInTheDocument();
    expect(container.querySelector('[title="Spotify"]')).not.toBeNull();
    await expectNoA11yViolations(container);

    rerender(
      <AudienceUserCell displayName={null} type='anonymous' showTypeDot />
    );
    expect(screen.queryByText('Bot')).not.toBeInTheDocument();
    expect(container.querySelector('[title]')).toBeNull();
  });

  it('keeps a long name truncated in a right-to-left row', async () => {
    const { container } = render(
      <div dir='rtl'>
        <AudienceUserCell
          displayName='جيمي ريفيرا'
          type='sms'
          showTypeDot
          className='custom'
        />
      </div>
    );

    expect(screen.getByText('جيمي ريفيرا')).toHaveClass('truncate');
    expect(container.querySelector('[title="SMS"]')).not.toBeNull();
    expect(container.querySelector('.custom')).not.toBeNull();
    await expectNoA11yViolations(container);
  });
});
