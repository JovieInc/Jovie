import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { AudienceIdentificationIndicator } from './AudienceIdentificationIndicator';

const base = {
  type: 'customer',
  hasEmail: true,
  hasPhone: false,
  spotifyConnected: false,
} as const;

describe('AudienceIdentificationIndicator certificate', () => {
  it.each([
    ['Identified', base],
    ['Partial', { ...base, type: 'sms', hasEmail: false, hasPhone: true }],
    ['Anonymous', { ...base, type: 'anonymous', hasEmail: false }],
  ] as const)('keeps the %s level axe-clean', async (label, props) => {
    const { container } = render(
      <AudienceIdentificationIndicator {...props} />
    );

    expect(screen.getByText(label)).toBeInTheDocument();
    await expectNoA11yViolations(container);
  });

  it('keeps a custom class in a right-to-left row', async () => {
    const { container } = render(
      <div dir='rtl'>
        <AudienceIdentificationIndicator {...base} className='custom-row' />
      </div>
    );

    expect(container.querySelector('.custom-row')).not.toBeNull();
    await expectNoA11yViolations(container);
  });
});
