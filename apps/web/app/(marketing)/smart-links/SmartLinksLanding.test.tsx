import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { SmartLinksLanding } from './SmartLinksLanding';

vi.mock('next/image', () => ({
  default: (props: { readonly alt: string; readonly src: string }) => (
    <img alt={props.alt} src={props.src} />
  ),
}));

describe('SmartLinksLanding', () => {
  it('presents the real link, the three-step journey, and a choice that follows the next release', () => {
    render(<SmartLinksLanding />);
    expect(
      screen.getByRole('heading', {
        level: 1,
        name: 'Share your work with one link.',
      })
    ).toBeInTheDocument();
    const demo = screen.getByTestId('smart-links-demo');
    expect(demo.parentElement).toHaveClass('items-start');
    expect(demo.parentElement).not.toHaveClass('items-center');
    const art = screen.getByRole('img', { name: 'Never Say A Word cover art' });
    expect(art.parentElement).toHaveClass(
      'relative',
      'aspect-square',
      'max-w-62',
      'overflow-hidden'
    );
    expect(screen.getByTestId('action-dial').querySelector('div')).toHaveClass(
      'min-h-53'
    );
    expect(
      screen.getByRole('link', { name: 'Open the live example' })
    ).toHaveAttribute('href', '/tim/never-say-a-word?noredirect=1');
    expect(
      screen.getByRole('heading', { name: 'Choose an app once' })
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Select Apple Music' }));
    expect(
      screen.getByRole('link', {
        name: 'Open live Smart Link with Apple Music',
      })
    ).toBeInTheDocument();
    fireEvent.click(
      screen.getByRole('button', { name: 'See the next release →' })
    );
    expect(
      screen.getByRole('img', { name: 'The Deep End cover art' })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('link', {
        name: 'Open live Smart Link with Apple Music',
      })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('link', {
        name: 'Open live Smart Link with Apple Music',
      })
    ).toHaveAttribute('href', '/tim/the-deep-end?noredirect=1');
  });
});
