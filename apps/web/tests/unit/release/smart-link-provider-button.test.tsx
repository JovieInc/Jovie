import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { SmartLinkProviderButton } from '@/features/release/SmartLinkProviderButton';

describe('SmartLinkProviderButton', () => {
  it('renders as a link when href is provided', () => {
    render(
      <SmartLinkProviderButton label='Spotify' href='https://spotify.com' />
    );

    const link = screen.getByRole('link', { name: /spotify/i });
    expect(link).toHaveAttribute('href', 'https://spotify.com');
  });

  it('renders as a button and calls onClick when href is omitted', () => {
    const onClick = vi.fn();
    render(<SmartLinkProviderButton label='Apple Music' onClick={onClick} />);

    const button = screen.getByRole('button', { name: /apple music/i });
    fireEvent.click(button);
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('calls onClick when link with href is clicked', () => {
    const onClick = vi.fn();
    render(
      <SmartLinkProviderButton
        label='Spotify'
        href='https://spotify.com'
        onClick={onClick}
      />
    );

    const link = screen.getByRole('link', { name: /spotify/i });
    link.addEventListener('click', event => event.preventDefault());
    fireEvent.click(link);
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('renders the provider icon in its brand color when iconColor is given', () => {
    render(
      <SmartLinkProviderButton
        label='Spotify'
        iconPath='M12 0v24'
        iconColor='var(--color-brand-spotify)'
      />
    );

    const icon = document.querySelector('svg');
    expect(icon).toHaveStyle({ color: 'var(--color-brand-spotify)' });
    expect(icon).not.toHaveClass('text-muted-foreground');
  });

  it('falls back to muted foreground when iconColor is omitted', () => {
    render(<SmartLinkProviderButton label='Spotify' iconPath='M12 0v24' />);

    const icon = document.querySelector('svg');
    expect(icon).toHaveClass('text-muted-foreground');
  });
});
