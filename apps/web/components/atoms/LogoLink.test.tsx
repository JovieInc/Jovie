import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { LogoLink } from './LogoLink';

const logoLinkCss = readFileSync(
  resolve(process.cwd(), 'components/atoms/LogoLink.css'),
  'utf8'
);

function cssBlock(source: string, marker: string): string {
  const start = source.indexOf(marker);
  if (start === -1) throw new Error(`Missing CSS block: ${marker}`);
  let depth = 0;
  for (let index = source.indexOf('{', start); index < source.length; index++) {
    if (source[index] === '{') depth += 1;
    if (source[index] === '}') {
      depth -= 1;
      if (depth === 0) return source.slice(start, index + 1);
    }
  }
  throw new Error(`Unclosed CSS block: ${marker}`);
}

describe('LogoLink', () => {
  it('exposes the destination, label, and nested logo at the requested size', () => {
    render(
      <LogoLink
        href='/app'
        logoSize='lg'
        variant='icon'
        data-testid='app-logo'
      />
    );

    const link = screen.getByRole('link', { name: 'Jovie' });
    expect(link).toHaveAttribute('href', '/app');
    expect(link).toHaveAttribute('data-testid', 'app-logo-link');
    expect(link.querySelector('svg')).toHaveAttribute('width', '32');
    expect(link.querySelector('svg')).toHaveAttribute('height', '32');
    expect(link).not.toHaveClass('logo-reveal');
    expect(screen.queryByTestId('logo-reveal-wordmark')).toBeNull();
  });

  it('wraps the icon in a spin mark and a hidden sliding wordmark when revealing', () => {
    render(<LogoLink variant='icon' reveal />);

    const link = screen.getByRole('link', { name: 'Jovie' });
    expect(link).toHaveClass('logo-reveal');
    expect(link).toHaveAttribute('data-logo-reveal', 'true');
    expect(screen.getByTestId('logo-reveal-mark')).toHaveClass(
      'logo-reveal__mark'
    );
    expect(
      screen.getByTestId('logo-reveal-mark').querySelector('svg')
    ).toBeInTheDocument();
    const wordmark = screen.getByTestId('logo-reveal-wordmark');
    expect(wordmark).toHaveClass('logo-reveal__wordmark');
    expect(wordmark).toHaveTextContent('Jovie');
    // The link already carries the accessible name; the wordmark is visual.
    expect(wordmark).toHaveAttribute('aria-hidden', 'true');
  });

  it('spins the mark and slides the wordmark on hover and keyboard focus', () => {
    const hover = cssBlock(logoLinkCss, '@media (hover: hover)');
    expect(hover).toMatch(
      /\.logo-reveal:hover \.logo-reveal__mark \{\s*rotate: 360deg;/
    );
    expect(hover).toMatch(
      /\.logo-reveal:hover \.logo-reveal__wordmark \{[^}]*opacity: 1;[^}]*translate: 0 -50%;/
    );
    expect(logoLinkCss).toMatch(
      /\.logo-reveal:focus-visible \.logo-reveal__mark \{\s*rotate: 360deg;/
    );
    // Rest state is 0deg, so leaving transitions back the other way.
    expect(cssBlock(logoLinkCss, '.logo-reveal__mark {')).toContain(
      'rotate: 0deg'
    );
    // The wordmark is out of flow: revealing it never shifts siblings.
    expect(cssBlock(logoLinkCss, '.logo-reveal__wordmark {')).toContain(
      'position: absolute'
    );
  });

  it('drops the spin and slide under reduced motion but still shows the wordmark', () => {
    const reduced = cssBlock(
      logoLinkCss,
      '@media (prefers-reduced-motion: reduce)'
    );
    expect(reduced).toMatch(/transition: none/);
    expect(reduced).toMatch(
      /\.logo-reveal:hover \.logo-reveal__mark,\s*\.logo-reveal:focus-visible \.logo-reveal__mark \{\s*rotate: 0deg;/
    );
    expect(reduced).not.toMatch(/opacity: 0/);
  });
});
