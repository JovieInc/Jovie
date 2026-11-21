import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { AudienceTypeBadge } from './AudienceTypeBadge';

describe('AudienceTypeBadge', () => {
  it.each([
    ['anonymous', 'Anonymous'],
    ['email', 'Email'],
    ['sms', 'SMS'],
    ['spotify', 'Spotify'],
    ['customer', 'Customer'],
  ] as const)('labels the %s type and stays axe-clean', async (type, label) => {
    const { container } = render(<AudienceTypeBadge type={type} />);

    expect(screen.getByText(label)).toBeInTheDocument();
    await expectNoA11yViolations(container);
  });

  it('keeps a custom class and renders in a right-to-left row', async () => {
    const { container } = render(
      <div dir='rtl'>
        <AudienceTypeBadge type='sms' className='custom-badge' />
      </div>
    );

    expect(container.querySelector('.custom-badge')).not.toBeNull();
    await expectNoA11yViolations(container);
  });
});
