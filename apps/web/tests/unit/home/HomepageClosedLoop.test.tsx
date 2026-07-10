import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { HomepageClosedLoop } from '@/components/homepage/HomepageClosedLoop';

describe('HomepageClosedLoop', () => {
  it('renders one ordered, semantic five-step story', () => {
    render(<HomepageClosedLoop />);

    expect(screen.getByTestId('homepage-closed-loop')).toBeInTheDocument();
    expect(
      screen.getByRole('heading', {
        level: 2,
        name: 'Every Release Makes The Next Move Clearer.',
      })
    ).toBeInTheDocument();
    expect(screen.getByRole('list')).toHaveAttribute(
      'aria-label',
      'The Jovie Closed Loop'
    );
    expect(screen.getAllByTestId('homepage-closed-loop-step')).toHaveLength(5);
    expect(
      screen.getAllByRole('listitem').map(step => step.textContent)
    ).toEqual([
      expect.stringContaining('Release'),
      expect.stringContaining('Capture'),
      expect.stringContaining('Route'),
      expect.stringContaining('Learn'),
      expect.stringContaining('Next Action'),
    ]);
  });

  it('keeps one static currentColor loop visual and no interactive state', () => {
    const { container } = render(<HomepageClosedLoop />);
    const visual = screen.getByTestId('homepage-closed-loop-visual');

    expect(visual).toHaveAttribute('aria-hidden', 'true');
    expect(container.querySelectorAll('svg')).toHaveLength(1);
    expect(
      container.querySelectorAll('svg [stroke="currentColor"]')
    ).not.toHaveLength(0);
    expect(
      container.querySelectorAll('svg [fill^="#"], svg [stroke^="#"]')
    ).toHaveLength(0);
    expect(container.querySelectorAll('button, input, a')).toHaveLength(0);
    expect(container.querySelector('style')).toBeNull();
  });

  it('exposes stable home.css integration hooks', () => {
    const { container } = render(<HomepageClosedLoop />);

    expect(
      container.querySelector('.homepage-closed-loop-section')
    ).toBeTruthy();
    expect(
      container.querySelector('.homepage-closed-loop-sequence')
    ).toBeTruthy();
    expect(
      container.querySelector('.homepage-closed-loop-visual')
    ).toBeTruthy();
  });
});
