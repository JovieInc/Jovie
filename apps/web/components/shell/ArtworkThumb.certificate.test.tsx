import { render, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { ArtworkThumb } from './ArtworkThumb';

type FakeImage = {
  onload: (() => void) | null;
  onerror: (() => void) | null;
  src: string;
};

function stubImage(outcome: 'load' | 'error' | 'pending') {
  const images: FakeImage[] = [];
  class StubImage {
    onload: (() => void) | null = null;
    onerror: (() => void) | null = null;
    private value = '';
    get src() {
      return this.value;
    }
    set src(next: string) {
      this.value = next;
      images.push(this);
      if (outcome === 'load') queueMicrotask(() => this.onload?.());
      if (outcome === 'error') queueMicrotask(() => this.onerror?.());
    }
  }
  vi.stubGlobal('Image', StubImage);
  return images;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('ArtworkThumb certificate', () => {
  it('holds the cover tile while the image is pending, axe-clean', async () => {
    const images = stubImage('pending');
    const { container } = render(
      <ArtworkThumb src='https://x.invalid/a.jpg' title='Lost' size={40} />
    );
    const tile = container.firstElementChild as HTMLElement;
    expect(tile).toHaveAttribute('data-artwork-state', 'fallback');
    expect(images[0]?.src).toBe('https://x.invalid/a.jpg');
    expect(tile.style.width).toBe('40px');
    await expectNoA11yViolations(container);
  });

  it('paints the source as a background once it loads', async () => {
    stubImage('load');
    const { container } = render(
      <ArtworkThumb src='https://x.invalid/b.jpg' title='Echo' size={48} />
    );
    const tile = container.firstElementChild as HTMLElement;
    await waitFor(() =>
      expect(tile).toHaveAttribute('data-artwork-state', 'image')
    );
    const layer = tile.querySelector('[aria-hidden="true"]') as HTMLElement;
    expect(layer.style.backgroundImage).toContain('https://x.invalid/b.jpg');
    await expectNoA11yViolations(container);
  });

  it('falls back to the cover tile when the source fails', async () => {
    const images = stubImage('error');
    const { container } = render(
      <ArtworkThumb src='https://x.invalid/c.jpg' title='Broken' size={40} />
    );
    await waitFor(() => expect(images).toHaveLength(1));
    const tile = container.firstElementChild as HTMLElement;
    expect(tile).toHaveAttribute('data-artwork-state', 'fallback');
    expect(
      container.querySelector('[data-artwork-fallback="true"]')
    ).toBeInTheDocument();
    await expectNoA11yViolations(container);
  });

  it('never requests an empty source', async () => {
    const images = stubImage('load');
    const { container } = render(
      <ArtworkThumb src='   ' title='Silence' size={40} />
    );
    expect(images).toHaveLength(0);
    expect(container.firstElementChild).toHaveAttribute(
      'data-artwork-state',
      'fallback'
    );
    await expectNoA11yViolations(container);
  });
});
