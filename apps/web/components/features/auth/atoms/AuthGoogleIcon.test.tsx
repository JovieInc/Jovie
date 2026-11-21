import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { AuthGoogleIcon } from './AuthGoogleIcon';

describe('AuthGoogleIcon', () => {
  it('renders the official full-color Google G', () => {
    const { container } = render(<AuthGoogleIcon className='h-4 w-4' />);

    expect(
      container.querySelector('[data-auth-google-icon="full-color"]')
    ).not.toBeNull();
    const fills = [...container.querySelectorAll('path')].map(path =>
      path.style.fill.toLowerCase()
    );
    expect(fills).toHaveLength(4);
    expect(fills).toEqual(
      ['#4285f4', '#34a853', '#fbbc05', '#ea4335'].map(hex =>
        hex.replace(
          /#(..)(..)(..)/,
          (_, r, g, b) =>
            `rgb(${Number.parseInt(r, 16)}, ${Number.parseInt(g, 16)}, ${Number.parseInt(b, 16)})`
        )
      )
    );
    expect(container.querySelector('svg')).toHaveAttribute(
      'aria-hidden',
      'true'
    );
  });

  it('applies a caller class name and stays axe-clean', async () => {
    const { container } = render(<AuthGoogleIcon className='size-5' />);

    expect(container.querySelector('svg')).toHaveClass('size-5');
    await expectNoA11yViolations(container);
  });
});
