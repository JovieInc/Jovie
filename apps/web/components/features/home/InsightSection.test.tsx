import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { InsightSection } from './InsightSection';

describe('InsightSection', () => {
  it('renders bounded action headline and personalization copy', () => {
    render(<InsightSection />);

    expect(
      screen.getByRole('heading', {
        level: 2,
        name: 'One action. The right one.',
      })
    ).toHaveClass('line-clamp-2');
    expect(screen.getByText(/single best next step/i)).toBeInTheDocument();
    expect(screen.getByText(/Every click teaches/i)).toBeInTheDocument();
  });

  it('uses canonical spacing tokens for the heading gap', () => {
    const source = readFileSync(
      resolve(__dirname, 'InsightSection.tsx'),
      'utf8'
    );
    expect(source).toContain("marginBottom: 'var(--space-8)'");
    expect(source).not.toMatch(/--linear-(?:space|gap|container)-/);
  });
});
