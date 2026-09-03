import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { WhatYouGetSection } from './WhatYouGetSection';

describe('WhatYouGetSection', () => {
  it('renders the feature grid heading and items', () => {
    render(<WhatYouGetSection />);
    expect(
      screen.getByRole('heading', {
        level: 2,
        name: 'What you get',
      })
    ).toBeInTheDocument();
    expect(screen.getByText('Auto-updating profile essentials')).toBeVisible();
  });

  it('uses canonical spacing tokens for feature spacing', () => {
    const source = readFileSync(
      resolve(__dirname, 'WhatYouGetSection.tsx'),
      'utf8'
    );
    expect(source).toContain("gap: 'var(--space-10)'");
    expect(source).toContain("gap: 'var(--space-3)'");
    expect(source).toContain("marginBottom: 'var(--space-1)'");
    expect(source).not.toMatch(/--linear-(?:space|gap|container)-/);
  });
});
