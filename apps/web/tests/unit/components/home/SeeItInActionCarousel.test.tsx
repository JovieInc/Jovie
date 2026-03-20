import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { SeeItInActionCarousel } from '@/components/features/home/SeeItInActionCarousel';

vi.mock('next/image', () => ({
  default: ({
    alt,
    blurDataURL: _blurDataURL,
    fill: _fill,
    src,
    ...props
  }: React.ComponentProps<'img'> & {
    blurDataURL?: string;
    fill?: boolean;
  }) => (
    <img src={typeof src === 'string' ? src : undefined} alt={alt} {...props} />
  ),
}));

vi.mock('next/link', () => ({
  default: ({
    children,
    href,
    ...props
  }: React.ComponentProps<'a'> & { href: string }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

describe('SeeItInActionCarousel', () => {
  it('renders the Tim White profile card', () => {
    render(<SeeItInActionCarousel />);

    expect(
      screen.getByRole('img', { name: /Tim White profile photo/i })
    ).toBeInTheDocument();
    expect(screen.getByText('Tim White')).toBeInTheDocument();
    expect(screen.getByText('Artist')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /jov\.ie\/tim/i })).toHaveAttribute(
      'href',
      '/tim'
    );
    expect(screen.getByRole('link', { name: /View Profile/i })).toHaveAttribute(
      'href',
      '/tim'
    );
  });

  it('renders all three release cards with artwork', () => {
    render(<SeeItInActionCarousel />);

    expect(screen.getByText('Never Say A Word')).toBeInTheDocument();
    expect(screen.getByText('The Deep End')).toBeInTheDocument();
    expect(screen.getByText('Take Me Over')).toBeInTheDocument();
    expect(
      screen.getByRole('img', { name: /Never Say A Word artwork/i })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('img', { name: /The Deep End artwork/i })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('img', { name: /Take Me Over artwork/i })
    ).toBeInTheDocument();
  });

  it('opens the popover and links DSP buttons to the smart link page', async () => {
    const user = userEvent.setup();

    render(<SeeItInActionCarousel />);
    await user.click(
      screen.getByRole('button', {
        name: /Open Never Say A Word smart link preview/i,
      })
    );

    expect(await screen.findByTestId('popover-content')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Open Spotify/i })).toHaveAttribute(
      'href',
      '/tim/never-say-a-word'
    );
    expect(
      screen.getByRole('link', { name: /Open Apple Music/i })
    ).toHaveAttribute('href', '/tim/never-say-a-word');
    expect(
      screen.getByRole('link', { name: /Open YouTube Music/i })
    ).toHaveAttribute('href', '/tim/never-say-a-word');
    expect(
      screen.getByRole('link', { name: /Open Amazon Music/i })
    ).toHaveAttribute('href', '/tim/never-say-a-word');
    expect(
      screen.getByRole('link', { name: /All platforms/i })
    ).toHaveAttribute('href', '/tim/never-say-a-word');
  });
});
