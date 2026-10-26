import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * Glass tokens (2026-10-26): one semantic frosted material for both themes.
 * Guards the OKLCH source values and proves secondary text stays at WCAG AA
 * (4.5:1) on the glass over the worst backdrops: black, white and every
 * Noir Ion accent at full strength.
 */

const __dirname = dirname(fileURLToPath(import.meta.url));
const css = readFileSync(
  join(__dirname, '..', '..', '..', 'styles', 'design-system.css'),
  'utf8'
);

type Rgb = [number, number, number];

function anchor(block: string, name: string): string {
  const match = block.match(new RegExp(`${name}:\\s*([^;]+);`));
  if (!match) throw new Error(`missing ${name}`);
  return match[1].trim();
}

const darkBlock =
  css
    .match(/:root\.dark\s*\{[\s\S]*?\n\}/g)
    ?.find(b => b.includes('--noir-ion-canvas')) ?? '';
const lightStart = css.indexOf('--noir-ion-glass-surface');
const lightBlock = css.slice(lightStart, css.indexOf('\n}', lightStart));

function hex(value: string): Rgb {
  const h = value.replace('#', '');
  return [0, 2, 4].map(
    i => Number.parseInt(h.slice(i, i + 2), 16) / 255
  ) as Rgb;
}

function oklch(value: string): { rgb: Rgb; alpha: number } {
  const m = value.match(
    /oklch\(([\d.]+)%\s+([\d.]+)\s+([\d.]+)\s*\/\s*([\d.]+)\)/
  );
  if (!m) throw new Error(`not oklch: ${value}`);
  const L = Number(m[1]) / 100;
  const C = Number(m[2]);
  const h = (Number(m[3]) * Math.PI) / 180;
  const a = C * Math.cos(h);
  const b = C * Math.sin(h);
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const mm = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
  const gamma = (c: number) => {
    const x = Math.min(1, Math.max(0, c));
    return x <= 0.0031308 ? 12.92 * x : 1.055 * x ** (1 / 2.4) - 0.055;
  };
  return {
    rgb: [
      gamma(4.0767416621 * l - 3.3077115913 * mm + 0.2309699292 * s),
      gamma(-1.2684380046 * l + 2.6097574011 * mm - 0.3413193965 * s),
      gamma(-0.0041960863 * l - 0.7034186147 * mm + 1.707614701 * s),
    ],
    alpha: Number(m[4]),
  };
}

function luminance([r, g, b]: Rgb): number {
  const lin = (c: number) =>
    c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

function contrast(a: Rgb, b: Rgb): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

const backdrops: Record<string, Rgb> = {
  black: [0, 0, 0],
  white: [1, 1, 1],
  ion: hex('#11afff'),
  ultra: hex('#8e56f5'),
  pulse: hex('#f52bb5'),
};

describe('glass tokens', () => {
  it('expose one semantic name per role, in OKLCH, for both themes', () => {
    expect(css).toContain(
      '--color-glass-surface: var(--noir-ion-glass-surface);'
    );
    expect(css).toContain('--color-glass-edge: var(--noir-ion-glass-edge);');
    expect(css).toContain('--glass-blur: var(--noir-ion-glass-blur);');
    for (const block of [lightBlock, darkBlock]) {
      expect(anchor(block, '--noir-ion-glass-surface')).toMatch(/^oklch\(/);
      expect(anchor(block, '--noir-ion-glass-edge')).toMatch(/^oklch\(/);
      expect(anchor(block, '--noir-ion-glass-blur')).toBe('8px');
    }
  });

  it.each([
    ['dark', darkBlock, anchor(darkBlock, '--noir-ion-text-secondary')],
    ['light', lightBlock, '#5a606a'],
  ])(
    'keeps %s secondary text at AA on glass over every backdrop',
    (_theme, block, secondary) => {
      const glass = oklch(anchor(block, '--noir-ion-glass-surface'));
      for (const [name, bg] of Object.entries(backdrops)) {
        const under = glass.rgb.map(
          (c, i) => c * glass.alpha + bg[i] * (1 - glass.alpha)
        ) as Rgb;
        expect(contrast(hex(secondary), under), name).toBeGreaterThanOrEqual(
          4.5
        );
      }
    }
  );
});
