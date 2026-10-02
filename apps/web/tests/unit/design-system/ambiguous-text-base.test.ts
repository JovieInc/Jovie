import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import postcss from 'postcss';
import { compile } from 'tailwindcss';
import { beforeAll, describe, expect, it } from 'vitest';

const WEB_ROOT = join(import.meta.dirname, '..', '..', '..');
const foundation = readFileSync(
  join(WEB_ROOT, 'styles', 'tailwind-foundation.css'),
  'utf8'
);
let compiledCss = '';

beforeAll(async () => {
  const source = postcss.parse(foundation);
  const declarations: string[] = [];

  source.walkAtRules(rule => {
    if (rule.name === 'theme' || rule.name === 'utility') {
      declarations.push(rule.toString());
    }
  });

  const compiler = await compile(
    '@theme { --text-base: 1rem; --text-base--line-height: 1.5; }\n' +
      `${declarations.join('\n')}\n@tailwind utilities;`
  );
  compiledCss = compiler.build([
    'text-base',
    'bg-base',
    'from-base',
    'to-base',
    'bg-(--color-bg-base)/90',
    'bg-(--color-bg-base)/96',
    'via-(--color-bg-base)/70',
  ]);
});

function declarationsFor(selector: string): Record<string, string> {
  const declarations: Record<string, string> = {};
  postcss.parse(compiledCss).walkRules(rule => {
    if (rule.selector !== selector) return;
    rule.walkDecls(declaration => {
      declarations[declaration.prop] = declaration.value;
    });
  });
  return declarations;
}

describe('unambiguous text-base Tailwind emission', () => {
  it('keeps text-base bound to the 16px type token, not a color token', () => {
    const declarations = declarationsFor('.text-base');

    expect(declarations['font-size']).toBe('var(--text-base)');
    expect(declarations['line-height']).toContain('--text-base--line-height');
    expect(declarations.color).toBeUndefined();
    expect(foundation).not.toContain('--color-base:');
  });

  it('preserves the established base surface and gradient utilities', () => {
    expect(declarationsFor('.bg-base')['background-color']).toBe(
      'var(--color-bg-base)'
    );
    expect(declarationsFor('.from-base')['--tw-gradient-from']).toBe(
      'var(--color-bg-base)'
    );
    expect(declarationsFor('.to-base')['--tw-gradient-to']).toBe(
      'var(--color-bg-base)'
    );
    expect(compiledCss).toContain(
      'color-mix(in oklab, var(--color-bg-base) 90%, transparent)'
    );
    expect(compiledCss).toContain(
      'color-mix(in oklab, var(--color-bg-base) 96%, transparent)'
    );
    expect(compiledCss).toContain(
      'color-mix(in oklab, var(--color-bg-base) 70%, transparent)'
    );
  });
});
