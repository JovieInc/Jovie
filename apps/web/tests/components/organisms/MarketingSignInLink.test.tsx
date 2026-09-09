import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { MarketingSignInLink } from '@/components/organisms/MarketingSignInLink';
import { APP_ROUTES } from '@/constants/routes';

const sourcePath = resolve(
  process.cwd(),
  'components/organisms/MarketingSignInLink.tsx'
);

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

  it('renders the pill variant on the canonical primary Button contract', () => {
    render(<MarketingSignInLink variant='pill' />);
    const link = screen.getByRole('link', { name: /sign in/i });
    expect(link).toHaveAttribute('data-variant', 'primary');
    expect(link).toHaveAttribute('data-size', 'md');
  });

  it('consumes canonical Button props only (JOV-5602: no deprecated alias)', () => {
    const source = readFileSync(sourcePath, 'utf8');
    expect(source).toContain("variant='primary'");
    expect(source).not.toContain('whitePill');
    expect(source).not.toContain('frosted');
    expect(source).not.toContain("variant='outline'");
  });

  it('renders homepage Log in as a text link, not a filled pill', () => {
    const { container } = render(
      <MarketingSignInLink variant='ghost' label='Log in' />
    );

    const link = screen.getByRole('link', { name: 'Log in' });
    expect(link).toHaveAttribute('href', APP_ROUTES.SIGNIN);
    expect(link.tagName).toBe('A');
    expect(container.querySelector('button')).toBeNull();
  });
});
