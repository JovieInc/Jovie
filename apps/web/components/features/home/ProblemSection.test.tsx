import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ProblemSection } from './ProblemSection';

describe('ProblemSection', () => {
  it('renders the growth headline', () => {
    render(<ProblemSection />);
    const heading = screen.getByRole('heading', {
      level: 2,
      name: /Built for growth with discipline/i,
    });

    expect(heading).toHaveClass('line-clamp-2');
    expect(screen.getByText('Clear value. No fluff.')).toBeInTheDocument();
  });

  it('uses canonical spacing tokens for the benefit list', () => {
    const source = readFileSync(
      resolve(__dirname, 'ProblemSection.tsx'),
      'utf8'
    );
    expect(source).toContain("gap: 'var(--space-10)'");
    expect(source).toContain("gap: 'var(--space-4)'");
    expect(source).toContain("marginBottom: 'var(--space-1)'");
    expect(source).not.toMatch(/--linear-(?:space|gap|container)-/);
  });
});
