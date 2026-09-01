import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { InsightSection } from './InsightSection';

describe('InsightSection', () => {
  it('renders the primary insight headline', () => {
    render(<InsightSection />);
    expect(
      screen.getByRole('heading', {
        level: 2,
        name: /One action. The right one./i,
      })
    ).toBeInTheDocument();
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
