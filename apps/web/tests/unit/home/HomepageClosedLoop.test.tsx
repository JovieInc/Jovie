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
  it('renders one ordered, semantic three-step story', () => {
    render(<HomepageClosedLoop />);

    expect(screen.getByTestId('homepage-closed-loop')).toBeInTheDocument();
    expect(
      screen.getByRole('heading', {
        level: 2,
        name: 'All your music working while you sleep',
      })
    ).toBeInTheDocument();
    expect(screen.getByRole('list')).toHaveAttribute(
      'aria-label',
      'How It Works'
    );
    expect(screen.getAllByTestId('homepage-closed-loop-step')).toHaveLength(3);
    expect(
      screen.getAllByRole('listitem').map(step => step.textContent)
    ).toEqual([
      expect.stringContaining('Connect your music'),
      expect.stringContaining('Jovie keeps watch'),
      expect.stringContaining('Choose what ships'),
    ]);
  });

  it('uses one static product screenshot and no interactive state', () => {
    const { container } = render(<HomepageClosedLoop />);

    const screenshot = screen.getByRole('img', {
      name: 'Jovie releases workspace with a selected release and detail rail',
    });

    expect(screenshot).toBeInTheDocument();
    expect(container.querySelectorAll('svg')).toHaveLength(0);
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
    expect(container.querySelector('.homepage-closed-loop-proof')).toBeTruthy();
  });

  it('keeps the closed-loop label on a WCAG-readable text token', () => {
    const labelRule = homeCss.match(
      /\.homepage-closed-loop-copy > p:first-child\s*\{[^}]*\}/
    )?.[0];

    expect(labelRule).toContain('var(--color-text-tertiary-token)');
    expect(labelRule).not.toContain('var(--color-text-quaternary-token)');
  });
});
