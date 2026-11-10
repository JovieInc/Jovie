import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('next/image', () => ({
  default: (props: { readonly alt: string; readonly src?: string }) => (
    <img alt={props.alt} src={props.src ?? '/image.webp'} />
  ),
}));

import DownloadPage from './page';

describe('DownloadPage hero layout', () => {
  it('keeps the mobile hero copy box from growing into the centered column', () => {
    render(<DownloadPage />);

    const heading = screen.getByRole('heading', {
      level: 1,
      name: 'Jovie, Installed Where You Work.',
    });
    expect(heading).toHaveClass('min-h-18', 'sm:min-h-30', 'line-clamp-2');
    expect(heading.className).not.toContain('marketing-h1-natural');

    const copy = heading.parentElement;
    expect(copy).toHaveClass('max-w-xl', 'max-sm:min-h-103');
    expect(copy?.parentElement).toHaveClass('items-start');
    expect(copy?.parentElement).not.toHaveClass('items-center');
  });

  it('steps the split-column hero down so the full headline stays inside two lines', () => {
    render(<DownloadPage />);

    expect(
      screen.getByRole('heading', {
        level: 1,
        name: 'Jovie, Installed Where You Work.',
      })
    ).toHaveClass('text-balance', 'sm:text-6xl', 'lg:text-5xl', 'xl:text-6xl');
  });

  it('does not call the shipped Mac app native', () => {
    render(<DownloadPage />);

    expect(document.body.textContent).not.toMatch(/\bnative\b/i);
    expect(
      screen.getByRole('heading', { level: 2, name: 'Mac Workspace' })
    ).toBeInTheDocument();
    expect(screen.getByText(/Download the Mac app\./)).toBeInTheDocument();
  });

  it('offers only what can be downloaded: no iPhone dead end', () => {
    render(<DownloadPage />);

    const text = document.body.textContent ?? '';
    expect(text).not.toMatch(/not a public download/i);
    expect(text).not.toMatch(/iPhone status/i);
    expect(text).not.toMatch(/not available on this page/i);
    expect(document.getElementById('iphone')).toBeNull();
  });

  it('shows one legible device shot in the hero with nothing overlapping it', () => {
    const { container } = render(<DownloadPage />);

    const hero = container.querySelector(
      '[data-testid="marketing-section-hero"]'
    );
    expect(hero).not.toBeNull();
    // Product shots carry alt text; a decorative backdrop has alt="".
    const shots = [...(hero?.querySelectorAll('img') ?? [])].filter(img =>
      img.getAttribute('alt')
    );
    expect(shots).toHaveLength(1);
    expect(hero?.querySelector('[data-overlap]')).toBeNull();
    const shot = hero?.querySelector(
      '[data-testid="download-desktop-screenshot"]'
    );
    // Full container width below the copy, never squeezed into a half column.
    expect(shot?.className).not.toMatch(/absolute/);
  });
});
