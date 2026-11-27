import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { ProductDemoCarousel } from './ProductDemoCarousel';

vi.mock('next/image', () => ({
  default: (props: { readonly alt: string; readonly className?: string }) => (
    <img alt={props.alt} className={props.className} />
  ),
}));

describe('ProductDemoCarousel', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('renders the first slide on media-fixed colour tokens', async () => {
    const { container } = render(<ProductDemoCarousel />);

    expect(screen.getByText('Your artist page, instantly')).toHaveClass(
      'text-on-media'
    );
    expect(container.querySelector('.bg-ink-on-media')).toBeInTheDocument();
    expect(container.innerHTML).not.toContain('bg-black');
    expect(container.innerHTML).not.toContain('text-white');
    await expectNoA11yViolations(container);
  });

  it('advances to the next slide from the slide button', async () => {
    const user = userEvent.setup();
    const { container } = render(<ProductDemoCarousel />);

    await user.click(screen.getByRole('button', { name: 'Next Slide' }));

    expect(
      await screen.findByText('Every release, every platform')
    ).toBeInTheDocument();
    await expectNoA11yViolations(container);
  });

  it('jumps to a slide from its dot and highlights it', async () => {
    const user = userEvent.setup();
    const { container } = render(<ProductDemoCarousel />);

    const dot = screen.getByRole('button', { name: 'Go to slide 3' });
    expect(dot.className).toContain('bg-on-media/30');
    await user.click(dot);

    expect(await screen.findByText('Own your audience')).toBeInTheDocument();
    expect(dot.className).toContain('bg-on-media');
    expect(dot.className).not.toContain('bg-white');
    await expectNoA11yViolations(container);
  });

  it('keeps the carousel in place while hovered', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    render(<ProductDemoCarousel />);

    await user.hover(screen.getByRole('button', { name: 'Next Slide' }));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(9000);
    });

    expect(screen.getByText('Your artist page, instantly')).toBeInTheDocument();
  });
});
