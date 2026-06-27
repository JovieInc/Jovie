import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const globalsPath = 'app/globals.css';

function readGlobals() {
  return readFileSync(resolve(process.cwd(), globalsPath), 'utf8');
}

describe('globals.css ui-feel quick wins (JOV-3368)', () => {
  const source = readGlobals();

  it('applies root font antialiasing', () => {
    expect(source).toContain('-webkit-font-smoothing: antialiased');
    expect(source).toContain('-moz-osx-font-smoothing: grayscale');
  });

  it('applies text-wrap balance on headings and pretty on body', () => {
    expect(source).toMatch(/h1,\s*\n\s*h2[\s\S]*text-wrap:\s*balance/);
    expect(source).toMatch(/body\s*\{[\s\S]*text-wrap:\s*pretty/);
  });

  it('applies tabular-nums on dynamic numerals', () => {
    expect(source).toMatch(
      /:where\(\.tabular-nums,\s*time,\s*\[data-tabular-nums\],\s*kbd\)[\s\S]*font-variant-numeric:\s*tabular-nums/
    );
  });

  it('applies subtle 1px image outlines', () => {
    expect(source).toMatch(
      /:where\(img:not\(\[role="presentation"\]\)[\s\S]*outline:\s*1px solid/
    );
  });

  it('uses named transition-transform and active scale on interactive controls', () => {
    expect(source).toContain('.interactive-press');
    expect(source).toMatch(
      /\.interactive-press\s*\{[\s\S]*transition-transform[\s\S]*active:scale-\[0\.96\]/
    );
    expect(source).toMatch(
      /button:not\(:disabled\)[\s\S]*transition:\s*transform var\(--duration-subtle\)/
    );
    expect(source).toMatch(/transform:\s*scale\(0\.96\)/);
    expect(source).not.toMatch(
      /\.interactive-press\s*\{[^}]*transition:\s*all/
    );
  });

  it('migrates btn-press from opacity to interactive-press', () => {
    expect(source).toMatch(/\.btn-press\s*\{[^}]*interactive-press/);
    expect(source).not.toMatch(/\.btn-press\s*\{[^}]*active:opacity-80/);
  });
});
