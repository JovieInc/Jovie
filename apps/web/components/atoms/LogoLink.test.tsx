import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { LogoLink } from './LogoLink';

describe('LogoLink', () => {
  it('exposes the destination, label, and nested logo at the requested size', () => {
    render(
      <LogoLink
        href='/app'
        logoSize='lg'
        variant='icon'
        data-testid='app-logo'
      />
    );

    const link = screen.getByRole('link', { name: 'Jovie' });
    expect(link).toHaveAttribute('href', '/app');
    expect(link).toHaveAttribute('data-testid', 'app-logo-link');
    expect(link.querySelector('svg')).toHaveAttribute('width', '32');
    expect(link.querySelector('svg')).toHaveAttribute('height', '32');
  });
});
