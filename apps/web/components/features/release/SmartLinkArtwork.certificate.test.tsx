import { fireEvent, render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { SmartLinkArtwork } from './SmartLinkArtwork';

vi.mock('@/features/release/AlbumArtworkContextMenu', () => ({
  AlbumArtworkContextMenu: ({ children }: { children: ReactNode }) => (
    <div>{children}</div>
  ),
  buildArtworkSizes: () => ({}),
}));

vi.mock('next/image', () => ({
  default: (props: {
    readonly alt: string;
    readonly className?: string;
    readonly onError?: () => void;
  }) => (
    <img alt={props.alt} className={props.className} onError={props.onError} />
  ),
}));

describe('SmartLinkArtwork certificate', () => {
  it('frames artwork with on-media tokens and stays axe-clean', async () => {
    const { container } = render(
      <SmartLinkArtwork src='/art.jpg' alt='Never Say A Word artwork' />
    );

    const frame = container.querySelector('[data-artwork-frame="hero"]');
    expect(frame).toHaveClass('bg-on-media/5', 'ring-on-media/10');
    expect(
      screen.getByRole('img', { name: 'Never Say A Word artwork' })
    ).toBeInTheDocument();
    await expectNoA11yViolations(container);
  });

  it('falls back to the placeholder glyph when the image fails to load', async () => {
    const { container } = render(
      <SmartLinkArtwork src='/broken.jpg' alt='Never Say A Word artwork' />
    );

    fireEvent.error(
      screen.getByRole('img', { name: 'Never Say A Word artwork' })
    );

    expect(screen.queryByRole('img')).toBeNull();
    const glyph = container.querySelector('svg.lucide-audio-lines');
    expect(glyph).toHaveClass('text-on-media/20');
    await expectNoA11yViolations(container);
  });

  it('renders the placeholder without a src, including in RTL', async () => {
    const { container } = render(
      <div dir='rtl' lang='ar'>
        <SmartLinkArtwork src={null} alt='غلاف الألبوم' title='لا تقل كلمة' />
      </div>
    );

    expect(container.querySelector('svg.lucide-audio-lines')).toBeTruthy();
    await expectNoA11yViolations(container);
  });
});
