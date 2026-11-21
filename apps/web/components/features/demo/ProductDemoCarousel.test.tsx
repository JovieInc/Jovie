import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { ProductDemoCarousel } from './ProductDemoCarousel';

describe('ProductDemoCarousel', () => {
  it('advances the slide when the frame is pressed', async () => {
    const user = userEvent.setup();
    const { container } = render(<ProductDemoCarousel />);

    expect(screen.getByText('Your artist page, instantly')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Next Slide' }));

    expect(
      screen.getByText('Every release, every platform')
    ).toBeInTheDocument();
    await expectNoA11yViolations(container);
  });

  it('jumps to a slide from its dot and keeps media-token colors', async () => {
    const user = userEvent.setup();
    render(<ProductDemoCarousel />);

    const dot = screen.getByRole('button', { name: 'Go to slide 3' });
    expect(dot.className).toContain('bg-on-media/30');
    expect(dot.className).not.toContain('bg-white');
    await user.click(dot);

    expect(screen.getByText('Own your audience')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Go to slide 3' }).className
    ).toContain('bg-on-media');
  });
});
