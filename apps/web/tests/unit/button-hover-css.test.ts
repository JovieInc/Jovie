import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { buttonVariants } from '@jovie/ui';
import postcss from 'postcss';
import { compile } from 'tailwindcss';
import { describe, expect, it } from 'vitest';

describe('canonical primary hover CSS', () => {
  it('emits the existing semantic hover background and border from real Button classes', async () => {
    // Use the actual app theme registrations, without unrelated source scans.
    // Theme blocks live in styles/tailwind-foundation.css (imported by
    // globals.css) since the JOV-2269 two-context split.
    const appCss = postcss.parse(
      ['app/globals.css', 'styles/tailwind-foundation.css']
        .map(path => readFileSync(resolve(path), 'utf8'))
        .join('\n')
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
