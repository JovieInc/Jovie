import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { MarketingSignInLink } from '@/components/organisms/MarketingSignInLink';
import { APP_ROUTES } from '@/constants/routes';

describe('MarketingSignInLink', () => {
  it('renders a direct sign-in link for intercepted auth navigation', () => {
    render(<MarketingSignInLink />);
    expect(screen.getByRole('link', { name: /sign in/i })).toHaveAttribute(
      'href',
      APP_ROUTES.SIGNIN
    );
  });

  it('renders the pill variant as a sign-in link', () => {
    render(<MarketingSignInLink variant='pill' />);
    expect(screen.getByRole('link', { name: /sign in/i })).toHaveAttribute(
      'href',
      APP_ROUTES.SIGNIN
    );
  });
});
