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
    expect(heading).toHaveClass(
      'marketing-h1-natural',
      'min-h-[4.5rem]',
      'sm:min-h-[7.5rem]'
    );
    expect(heading).not.toHaveClass('line-clamp-2');

    const copy = heading.parentElement;
    expect(copy).toHaveClass('max-w-xl', 'max-sm:min-h-[25.75rem]');
    expect(copy?.parentElement).toHaveClass('items-start', 'lg:items-center');
    expect(copy?.parentElement).not.toHaveClass('items-center');
  });
});
