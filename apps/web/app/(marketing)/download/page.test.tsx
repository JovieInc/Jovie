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
    expect(copy?.parentElement).toHaveClass('items-start', 'lg:items-center');
    expect(copy?.parentElement).not.toHaveClass('items-center');
  });

  it('does not call the shipped Mac app native', () => {
    render(<DownloadPage />);

    expect(document.body.textContent).not.toMatch(/\bnative\b/i);
    expect(
      screen.getByRole('heading', { level: 2, name: 'Mac Workspace' })
    ).toBeInTheDocument();
    expect(screen.getByText(/Download the Mac app\./)).toBeInTheDocument();
  });
});
