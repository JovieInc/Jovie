import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { AuthGoogleIcon } from './AuthGoogleIcon';

describe('AuthGoogleIcon', () => {
  it('renders the official full-color Google G', () => {
    const { container } = render(<AuthGoogleIcon className='h-4 w-4' />);

    expect(
      container.querySelector('[data-auth-google-icon="full-color"]')
    ).not.toBeNull();
    expect(container.querySelector('path[fill="#4285F4"]')).not.toBeNull();
    expect(container.querySelector('svg')).toHaveAttribute(
      'aria-hidden',
      'true'
    );
  });
});
