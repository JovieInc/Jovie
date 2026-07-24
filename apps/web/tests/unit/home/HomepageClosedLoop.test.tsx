import { readFileSync } from 'node:fs';
import path from 'node:path';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { HomepageClosedLoop } from '@/components/homepage/HomepageClosedLoop';

const homeCss = readFileSync(
  path.resolve(__dirname, '../../../app/(home)/home.css'),
  'utf8'
);

describe('HomepageClosedLoop', () => {
  it('renders one ordered, semantic five-step story', () => {
    render(<HomepageClosedLoop />);

    expect(screen.getByTestId('homepage-closed-loop')).toBeInTheDocument();
    expect(
      screen.getByRole('heading', {
        level: 2,
        name: 'Every release makes the next move clearer.',
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

  it('keeps the closed-loop label on a WCAG-readable text token', () => {
    const labelRule = homeCss.match(
      /\.homepage-closed-loop-copy > p:first-child\s*\{[^}]*\}/
    )?.[0];

    expect(labelRule).toContain('var(--color-text-tertiary-token)');
    expect(labelRule).not.toContain('var(--color-text-quaternary-token)');
  });
});
