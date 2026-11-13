import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { APP_ROUTES } from '@/constants/routes';
import { RootNotFoundHeader } from './RootNotFoundHeader';

describe('RootNotFoundHeader', () => {
  it('draws the wordmark as a link home inside the primary navigation', () => {
    render(<RootNotFoundHeader />);

    const nav = screen.getByRole('navigation', { name: 'Primary Navigation' });
    const header = screen.getByTestId('header-nav');
    expect(header).toContainElement(nav);
    expect(header.style.zIndex).toBe('var(--z-index-site-header)');
    const home = within(nav)
      .getAllByRole('link')
      .find(link => link.getAttribute('href') === APP_ROUTES.HOME);
    expect(home).toBeDefined();
    expect(home?.querySelector('svg, img')).not.toBeNull();
  });

  it('offers a plain Sign in link to the sign-in route', () => {
    render(<RootNotFoundHeader />);

    expect(screen.getByRole('link', { name: 'Sign in' })).toHaveAttribute(
      'href',
      APP_ROUTES.SIGNIN
    );
  });

  it('renders no buttons, so the 404 header needs no client state', () => {
    render(<RootNotFoundHeader />);

    expect(screen.queryAllByRole('button')).toHaveLength(0);
  });
});
