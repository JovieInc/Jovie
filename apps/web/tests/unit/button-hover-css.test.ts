import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { buttonVariants } from '@jovie/ui';
import postcss from 'postcss';
import { compile } from 'tailwindcss';
import { describe, expect, it } from 'vitest';

describe('canonical primary hover CSS', () => {
  it('emits the existing semantic hover background and border from real Button classes', async () => {
    // Use the actual app theme registrations, without unrelated source scans.
    // This catches a valid-looking class whose semantic token was never registered.
    const appCss = postcss.parse(
      readFileSync(resolve('app/globals.css'), 'utf8')
    );
    const themes: string[] = [];
    appCss.walkAtRules('theme', rule => {
      themes.push(rule.toString());
    });
    const compiler = await compile(
      `${themes.join('\n')}\n@tailwind utilities;`
    );
    const candidates = buttonVariants({ variant: 'primary', size: 'marketing' })
      .split(/\s+/)
      .filter(candidate => candidate.startsWith('hover:'));
    const output = postcss.parse(compiler.build(candidates));
    const declarations: Record<string, string> = {};
    output.walkRules(rule => {
      if (!rule.selector.endsWith(':hover')) return;
      rule.walkDecls(declaration => {
        declarations[declaration.prop] = declaration.value;
      });
    });
    expect(
      declarations['background-color'],
      JSON.stringify({ candidates, css: output.toString() })
    ).toBe('var(--color-btn-primary-hover)');
    expect(declarations['border-color']).toBe('var(--color-btn-primary-hover)');
  });
});
