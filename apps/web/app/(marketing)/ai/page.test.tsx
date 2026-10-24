import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import AiPage, { metadata } from './page';

describe('AiPage', () => {
  it('keeps the complete hero headline within the shared two-line contract', () => {
    render(<AiPage />);

    const heading = screen.getByRole('heading', {
      level: 1,
      name: 'The AI operating system behind every Jovie profile',
    });
    expect(heading).toHaveClass('ai-hero-title', 'marketing-h1-max-two-lines');
    expect(heading).not.toHaveAttribute('data-wrap');
  });

  it('pins twitter share attribution to the canonical X handle', () => {
    expect(metadata.twitter?.site).toBe('@meetjovie');
    expect(metadata.twitter?.creator).toBe('@meetjovie');

    const source = readFileSync(resolve(__dirname, 'page.tsx'), 'utf8');
    expect(source).toContain('COMPANY_IDENTITY.xHandle');
    expect(source).not.toContain('@jovieapp');
  });
});
