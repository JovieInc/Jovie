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
    fireEvent.click(link);
    expect(onClick).toHaveBeenCalledTimes(1);
  });
});
