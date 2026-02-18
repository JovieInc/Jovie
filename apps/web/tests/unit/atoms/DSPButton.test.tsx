import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { DSPButton } from '@/components/atoms/DSPButton';
import { expectNoA11yViolations } from '../../utils/a11y';

vi.mock('isomorphic-dompurify', () => ({
  default: { sanitize: (s: string) => s },
}));

const defaultProps = {
  name: 'Spotify',
  dspKey: 'spotify',
  url: 'https://open.spotify.com/track/123',
  backgroundColor: '#1DB954',
  textColor: '#FFFFFF',
  logoSvg: '<svg><circle cx="12" cy="12" r="10" /></svg>',
};

describe('DSPButton', () => {
  it('renders with correct aria-label for external URL', () => {
    render(<DSPButton {...defaultProps} />);
    const button = screen.getByRole('button', {
      name: 'Open in Spotify (opens in new window)',
    });
    expect(button).toBeInTheDocument();
  });

  it('renders with correct aria-label for internal URL', () => {
    render(<DSPButton {...defaultProps} url='/internal/path' />);
    const button = screen.getByRole('button', {
      name: 'Open in Spotify',
    });
    expect(button).toBeInTheDocument();
  });

  it('displays the DSP name', () => {
    render(<DSPButton {...defaultProps} />);
    expect(screen.getByText('Open in Spotify')).toBeInTheDocument();
  });

  it('calls onClick with dspKey and url when clicked', () => {
    const handleClick = vi.fn();
    render(<DSPButton {...defaultProps} onClick={handleClick} />);
    fireEvent.click(
      screen.getByRole('button', {
        name: 'Open in Spotify (opens in new window)',
      })
    );
    expect(handleClick).toHaveBeenCalledWith(
      'spotify',
      'https://open.spotify.com/track/123'
    );
  });

  it('opens external URL in new window when no onClick provided', () => {
    const openSpy = vi.spyOn(globalThis, 'open').mockImplementation(() => null);
    render(<DSPButton {...defaultProps} />);
    fireEvent.click(
      screen.getByRole('button', {
        name: 'Open in Spotify (opens in new window)',
      })
    );
    expect(openSpy).toHaveBeenCalledWith(
      'https://open.spotify.com/track/123',
      '_blank',
      'noopener,noreferrer'
    );
    openSpy.mockRestore();
  });

  it('renders in disabled state', () => {
    render(<DSPButton {...defaultProps} disabled />);
    const button = screen.getByRole('button', {
      name: 'Open in Spotify (opens in new window)',
    });
    expect(button).toBeDisabled();
  });

  it('does not call onClick when disabled', () => {
    const handleClick = vi.fn();
    render(<DSPButton {...defaultProps} onClick={handleClick} disabled />);
    fireEvent.click(
      screen.getByRole('button', {
        name: 'Open in Spotify (opens in new window)',
      })
    );
    expect(handleClick).not.toHaveBeenCalled();
  });

  it('applies custom background and text colors', () => {
    render(<DSPButton {...defaultProps} />);
    const button = screen.getByRole('button', {
      name: 'Open in Spotify (opens in new window)',
    });
    expect(button).toHaveStyle({
      backgroundColor: '#1DB954',
      color: '#FFFFFF',
    });
  });

  it('renders the sanitized logo SVG', () => {
    render(<DSPButton {...defaultProps} />);
    const button = screen.getByRole('button', {
      name: 'Open in Spotify (opens in new window)',
    });
    const logoContainer = button.querySelector('[aria-hidden="true"]');
    expect(logoContainer).toBeInTheDocument();
    expect(logoContainer?.innerHTML).toContain('<svg>');
  });

  it('has no accessibility violations', async () => {
    const { container } = render(<DSPButton {...defaultProps} />);
    await expectNoA11yViolations(container);
  });
});
