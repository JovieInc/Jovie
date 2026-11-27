import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
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

import { expectNoA11yViolations } from '@/tests/utils/a11y';
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
    const badge = screen.getByText('Out now');
    expect(badge).toBeInTheDocument();
    expect(badge.className).toContain('border-on-media/10');
    expect(badge.className).not.toContain('border-white');
    expect(badge.className).not.toContain('uppercase');
    expect(
      screen.getByRole('link', { name: /Made with Jovie/i })
    ).toHaveAttribute(
      'href',
      '/?utm_source=via_jovie&utm_medium=footer&utm_campaign=via-jovie-footer'
    );
  });

  it('opens the listen link and stays axe-clean', async () => {
    const user = userEvent.setup();
    const { container } = render(<DemoReleasePresaveSurface />);
    const listen = screen.getByRole('link', { name: /Listen Everywhere/i });
    const onClick = vi.fn((event: Event) => event.preventDefault());
    listen.addEventListener('click', onClick);

    await user.click(listen);

    expect(onClick).toHaveBeenCalledTimes(1);
    expect(listen).toHaveAttribute(
      'href',
      'https://cosmicgate.choons.at/thedeepend'
    );
    await expectNoA11yViolations(container);
  });
});
