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
        name: 'One Link. Their Music App.',
      })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: 'Open the live example' })
    ).toHaveAttribute('href', '/tim/never-say-a-word?noredirect=1');
    expect(
      screen.getByRole('heading', { name: 'Choose once' })
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

  it('keeps link creation hidden until the MVP flag includes it', () => {
    const { rerender } = render(<SmartLinksLanding />);
    expect(
      screen.queryByLabelText('Paste a song link or type a name')
    ).toBeNull();

    rerender(<SmartLinksLanding showMaker />);
    expect(
      screen.getByLabelText('Paste a song link or type a name')
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Make my link' })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { name: 'Three anonymous links each month' })
    ).toBeInTheDocument();
  });
});
