import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import {
  defaultCssFiles,
  extractRules,
  loadThemeTablesFromFiles,
  resolveValue,
} from '@/lib/a11y-gates/contrast-engine';
import { contrastRatio } from '@/lib/utils/color';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import {
  buildSmartLinkReportHref,
  SmartLinkArtistName,
  SmartLinkArtworkCard,
  SmartLinkPageFrame,
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
  it('tracks the Made with Jovie link with the via-jovie-footer loop id', () => {
    render(<SmartLinkPoweredByFooter />);
    const href = screen
      .getByRole('link', { name: /Made with Jovie/i })
      .getAttribute('href');
    expect(href).toContain('utm_campaign=via-jovie-footer');
    expect(href).toContain('utm_source=via_jovie');
    expect(href).toContain('utm_medium=footer');
  });

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
    expect(
      screen.getByRole('link', { name: /Made with Jovie/i })
    ).toHaveAttribute(
      'href',
      '/?utm_source=via_jovie&utm_medium=footer&utm_campaign=via-jovie-footer'
    );

    rerender(<SmartLinkPoweredByFooter reportTarget='/tim/never-say-a-word' />);
    expect(link).toHaveAttribute(
      'href',
      '/report?type=smart_link&target=%2Ftim%2Fnever-say-a-word'
    );
  });

  it('gives every footer link a 44px hit container and has brand-first hierarchy with no separators', () => {
    render(<SmartLinkPoweredByFooter />);
    for (const link of screen.getAllByRole('link')) {
      expect(link.className).toContain('before:h-11');
      expect(link.className).toContain('before:min-w-11');
    }
    const brand = screen.getByRole('link', { name: /Made with Jovie/i });
    const report = screen.getByRole('link', { name: 'Report' });
    expect(brand.className).toContain('text-sm');
    expect(report.className).toContain('text-xs');
    expect(
      screen.getByRole('contentinfo').textContent?.includes('\u00b7')
    ).toBe(false);
    expect(screen.getByRole('link', { name: 'Report' }).textContent).toBe(
      'Report'
    );
    expect(screen.getByRole('link', { name: 'Privacy' })).toHaveAttribute(
      'href',
      '/legal/privacy'
    );
  });

  it('builds an unambiguous report target and ignores blank targets', () => {
    expect(buildSmartLinkReportHref('/tim/never-say-a-word')).toBe(
      '/report?type=smart_link&target=%2Ftim%2Fnever-say-a-word'
    );
    expect(buildSmartLinkReportHref('  ')).toBe('/report?type=smart_link');
    expect(buildSmartLinkReportHref(null)).toBe('/report?type=smart_link');
  });
});

describe('SmartLink page states', () => {
  it('keeps the card tint and light footer colours on tokens', () => {
    render(
      <>
        <SmartLinkArtworkCard title='Never Say A Word' artworkUrl={null} />
        <SmartLinkPoweredByFooter />
      </>
    );
    const brand = screen.getByRole('link', { name: /Made with Jovie/i });
    expect(brand).toHaveClass(
      'text-(--color-smart-link-footer-text)',
      'hover:text-(--color-smart-link-footer-text-hover)'
    );
    expect(screen.getByRole('link', { name: 'Report' })).toHaveClass(
      'hover:text-(--color-smart-link-footer-text-hover)'
    );
    expect(document.querySelector('.bg-on-media\\/5')).not.toBeNull();
  });

  it('renders the empty-artwork card without axe violations', async () => {
    const { container } = render(
      <SmartLinkArtworkCard title='Never Say A Word' artworkUrl={null} />
    );
    expect(container.querySelector('svg.lucide-audio-lines')).toBeTruthy();
    await expectNoA11yViolations(container);
  });

  it('renders an artist without a handle as plain text inside the frame without axe violations', async () => {
    const { container } = render(
      <SmartLinkPageFrame centered mainId='smart-link-main'>
        <SmartLinkArtworkCard title='Never Say A Word' artworkUrl={null} />
        <SmartLinkArtistName name='Tim White' handle={null} />
      </SmartLinkPageFrame>
    );
    expect(screen.getByText('Tim White').tagName).toBe('P');
    expect(screen.queryByRole('link', { name: 'Tim White' })).toBeNull();
    expect(screen.getByRole('main')).toHaveAttribute('id', 'smart-link-main');
    await expectNoA11yViolations(container);
  });

  it('links a long artist name to its profile and keeps focus order, without axe violations', async () => {
    const user = userEvent.setup();
    const name =
      'Tim White, The Midnight Strings Orchestra, Ava Lune and Friends';
    const { container } = render(
      <SmartLinkPageFrame>
        <SmartLinkArtistName name={name} handle='tim' />
      </SmartLinkPageFrame>
    );
    const artist = screen.getByRole('link', { name });
    expect(artist).toHaveAttribute('href', '/tim');
    await user.tab();
    expect(artist).toHaveFocus();
    await user.tab();
    expect(
      screen.getByRole('link', { name: /Made with Jovie/i })
    ).toHaveFocus();
    await expectNoA11yViolations(container);
  });

  it('renders the frame in a right-to-left page without axe violations', async () => {
    const { container } = render(
      <div dir='rtl' lang='ar'>
        <SmartLinkPageFrame centered>
          <SmartLinkArtistName name='تيم وايت' handle='tim' />
        </SmartLinkPageFrame>
      </div>
    );
    expect(screen.getByRole('link', { name: 'تيم وايت' })).toHaveAttribute(
      'href',
      '/tim'
    );
    await expectNoA11yViolations(container);
  });
});
