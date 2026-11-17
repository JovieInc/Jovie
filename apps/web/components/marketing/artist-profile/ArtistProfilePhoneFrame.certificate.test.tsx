import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { ArtistProfilePhoneFrame } from './ArtistProfilePhoneFrame';

describe('ArtistProfilePhoneFrame certificate', () => {
  it.each(['lg', 'md', 'sm'] as const)(
    'renders the %s frame around its screen axe-clean',
    async size => {
      const { container } = render(
        <ArtistProfilePhoneFrame size={size}>
          <p>Profile preview</p>
        </ArtistProfilePhoneFrame>
      );

      expect(container.querySelector('.ap-phone-frame')).toHaveAttribute(
        'data-size',
        size
      );
      expect(screen.getByText('Profile preview')).toBeInTheDocument();
      await expectNoA11yViolations(container);
    }
  );

  it('keeps every line of a long screen in the viewport container', async () => {
    const lines = Array.from({ length: 24 }, (_, i) => `Tour date ${i + 1}`);
    const { container } = render(
      <ArtistProfilePhoneFrame className='w-full'>
        <ul>
          {lines.map(line => (
            <li key={line}>{line}</li>
          ))}
        </ul>
      </ArtistProfilePhoneFrame>
    );

    expect(container.querySelector('.ap-phone-frame')).toHaveClass('w-full');
    const viewport = container.querySelector('.ap-phone-frame__viewport');
    expect(viewport?.querySelectorAll('li')).toHaveLength(24);
    await expectNoA11yViolations(container);
  });

  it('renders an Arabic screen in a right-to-left document', async () => {
    const { container } = render(
      <div dir='rtl' lang='ar'>
        <ArtistProfilePhoneFrame size='sm'>
          <p>استمع إلى الإصدار الجديد الآن.</p>
        </ArtistProfilePhoneFrame>
      </div>
    );

    expect(
      screen.getByText('استمع إلى الإصدار الجديد الآن.')
    ).toBeInTheDocument();
    await expectNoA11yViolations(container);
  });
});
