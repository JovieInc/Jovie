import { render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('next/image', () => ({
  default: (props: { readonly alt: string; readonly className?: string }) => (
    <img alt={props.alt} className={props.className} />
  ),
}));

vi.mock('./DemoClientProviders', () => ({
  DemoClientProviders: ({ children }: { readonly children: ReactNode }) => (
    <>{children}</>
  ),
}));

vi.mock('@/features/profile/ProfileDrawerShell', () => ({
  ProfileDrawerShell: () => null,
}));

vi.mock('@/features/share/PublicShareMenu', () => ({
  PublicShareActionList: () => null,
}));

import { DemoReleasePresaveSurface } from './DemoReleasePresaveSurface';

describe('DemoReleasePresaveSurface', () => {
  it('renders the title and artist below clean square art', () => {
    render(<DemoReleasePresaveSurface />);

    const art = screen.getByTestId('smart-link-artwork');
    const title = screen.getByRole('heading', { name: 'The Deep End' });
    const artist = screen.getByRole('link', {
      name: 'Cosmic Gate & Tim White',
    });

    expect(title.tagName).toBe('H1');
    expect(title.className).toContain('text-2xl');
    expect(title.className).not.toContain('text-shadow');
    expect(artist.className).not.toContain('text-shadow');
    expect(art).not.toContainElement(title);
    expect(art).not.toContainElement(artist);
    expect(art.textContent).toBe('');
    expect(screen.getByText('Out now')).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: /Made with Jovie/i })
    ).toHaveAttribute(
      'href',
      '/?utm_source=via_jovie&utm_medium=footer&utm_campaign=via-jovie-footer'
    );
  });
});
