import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PublicTableOfContents } from '@/components/molecules/PublicTableOfContents';

const TOC = [
  { id: 'overview', title: 'Overview' },
  { id: 'details', title: 'Details' },
] as const;

describe('PublicTableOfContents', () => {
  beforeEach(() => {
    document.body.innerHTML = `
      <section id="overview">Overview heading</section>
      <section id="details">Details heading</section>
    `;

    vi.stubGlobal(
      'IntersectionObserver',
      vi.fn().mockImplementation(() => ({
        observe: vi.fn(),
        disconnect: vi.fn(),
      }))
    );
    vi.spyOn(globalThis.history, 'replaceState').mockImplementation(() => {});

    for (const entry of TOC) {
      const element = document.getElementById(entry.id);
      if (element) {
        element.scrollIntoView = vi.fn();
      }
    }
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    document.body.innerHTML = '';
  });

  it('renders a shared public table of contents rail', () => {
    render(<PublicTableOfContents toc={[...TOC]} />);

    expect(
      screen.getByRole('navigation', { name: 'Table of contents' })
    ).toBeInTheDocument();
    expect(screen.getByText('On this page')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Overview' })
    ).toBeInTheDocument();
  });

  it('jumps to headings and updates browser history', () => {
    render(<PublicTableOfContents toc={[...TOC]} />);

    const overviewButton = screen.getByRole('button', { name: 'Overview' });
    const overviewSection = document.getElementById(
      'overview'
    ) as HTMLElement & {
      scrollIntoView: ReturnType<typeof vi.fn>;
    };

    fireEvent.click(overviewButton);

    expect(overviewSection.scrollIntoView).toHaveBeenCalledWith({
      behavior: 'smooth',
      block: 'start',
    });
    expect(globalThis.history.replaceState).toHaveBeenCalledWith(
      null,
      '',
      '#overview'
    );
    expect(overviewButton).toHaveAttribute('aria-current', 'location');
  });

  it('supports keyboard traversal between TOC items', () => {
    render(<PublicTableOfContents toc={[...TOC]} />);

    const overviewButton = screen.getByRole('button', { name: 'Overview' });
    const detailsButton = screen.getByRole('button', { name: 'Details' });

    overviewButton.focus();
    fireEvent.keyDown(overviewButton, { key: 'ArrowDown' });

    expect(detailsButton).toHaveFocus();

    fireEvent.keyDown(detailsButton, { key: 'ArrowUp' });
    expect(overviewButton).toHaveFocus();
  });
});
