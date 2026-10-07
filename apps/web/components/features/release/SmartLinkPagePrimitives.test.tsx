import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import {
  defaultCssFiles,
  extractRules,
  loadThemeTablesFromFiles,
  resolveValue,
} from '@/lib/a11y-gates/contrast-engine';
import { contrastRatio } from '@/lib/utils/color';
import {
  SmartLinkArtworkCard,
  SmartLinkPoweredByFooter,
} from './SmartLinkPagePrimitives';

vi.mock('next/image', () => ({
  default: (props: { readonly alt: string; readonly className?: string }) => (
    <img alt={props.alt} className={props.className} />
  ),
}));

describe('SmartLinkArtworkCard', () => {
  it('preserves complete artwork with contain fit', () => {
    render(
      <SmartLinkArtworkCard title='Never Say A Word' artworkUrl='/art.jpg' />
    );
    const image = screen.getByRole('img', { name: 'Never Say A Word artwork' });
    expect(image).toHaveClass('object-contain');
    expect(image).not.toHaveClass('object-cover');
  });

  it('uses the banned-icon-safe AudioLines glyph without artwork', () => {
    const { container } = render(
      <SmartLinkArtworkCard title='Never Say A Word' artworkUrl={null} />
    );

    const icon = container.querySelector('svg.lucide-audio-lines');
    expect(icon).toBeTruthy();
    expect(container.querySelector('svg.lucide-disc-3')).toBeNull();
  });
});

describe('SmartLinkPoweredByFooter', () => {
  it('keeps every dark footer link above AA on the real base tokens', () => {
    render(<SmartLinkPoweredByFooter />);
    const webRoot = resolve(import.meta.dirname, '../../..');
    const { dark } = loadThemeTablesFromFiles(defaultCssFiles(webRoot));
    // Tailwind's @theme declarations are aliases, not runtime selectors.
    // Let the existing CSS parser read them as a variable declaration block.
    const aliases = extractRules(
      readFileSync(
        resolve(webRoot, 'styles/tailwind-foundation.css'),
        'utf8'
      ).replace(/@theme(?:\s+inline)?/g, ':root')
    );
    const background = resolveValue('var(--color-bg-base)', dark);
    for (const link of screen.getAllByRole('link')) {
      const text = /\bdark:text-([^\s/]+)(?:\/(\d+))?/.exec(link.className);
      if (!text || !background) throw new Error('Footer colors must resolve');
      const token = `--color-${text[1]}`;
      const alias = aliases
        .map(rule => rule.declarations.get(token))
        .find(Boolean);
      const foreground = resolveValue(alias ?? `var(${token})`, dark);
      if (!foreground) throw new Error('Footer foreground must resolve');
      expect(foreground).toMatch(/^#[a-f\d]{6}$/i);
      expect(background).toMatch(/^#[a-f\d]{6}$/i);
      const alpha = text[2] ? Number(text[2]) / 100 : 1;
      const composite = `#${[1, 3, 5]
        .map(offset => {
          const fg = Number.parseInt(foreground.slice(offset, offset + 2), 16);
          const bg = Number.parseInt(background.slice(offset, offset + 2), 16);
          return Math.round(fg * alpha + bg * (1 - alpha))
            .toString(16)
            .padStart(2, '0');
        })
        .join('')}`;
      expect(
        contrastRatio(composite, background),
        link.textContent ?? ''
      ).toBeGreaterThanOrEqual(4.5);
    }
  });

  it('links to the abuse report flow for smart links', () => {
    const { rerender } = render(<SmartLinkPoweredByFooter />);
    const link = screen.getByRole('link', { name: 'Report' });
    expect(link).toHaveAttribute('href', '/report?type=smart_link');
    expect(screen.getByRole('link', { name: /Powered by/i })).toHaveAttribute(
      'href',
      '/'
    );

    rerender(
      <SmartLinkPoweredByFooter reportHref='/report?type=smart_link&target=abc' />
    );
    expect(link).toHaveAttribute('href', '/report?type=smart_link&target=abc');
  });
});
