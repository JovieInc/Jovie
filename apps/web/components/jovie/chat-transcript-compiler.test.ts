// @vitest-environment node
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * JOV-6702: React Compiler caches `virtualizer.getVirtualItems()` and
 * `getTotalSize()` on the stable `virtualizer` object, so the transcript froze
 * on its first row window and went blank when scrolled to the latest turns.
 * Compile the real sources with the production compiler and require that the
 * components reading live virtualizer state are left uncompiled.
 */
const require = createRequire(import.meta.url);
const babel = require('next/dist/compiled/babel/core') as {
  transformSync(
    code: string,
    options: Record<string, unknown>
  ): { code?: string | null } | null;
};

function compile(relativePath: string): string {
  const filename = path.join(__dirname, relativePath);
  const result = babel.transformSync(readFileSync(filename, 'utf8'), {
    filename,
    babelrc: false,
    configFile: false,
    plugins: [
      [require.resolve('babel-plugin-react-compiler'), {}],
      require.resolve('next/dist/compiled/babel/plugin-syntax-jsx'),
      [
        require.resolve('next/dist/compiled/babel/plugin-syntax-typescript'),
        { isTSX: true },
      ],
    ],
  });
  return result?.code ?? '';
}

function functionBody(code: string, name: string): string {
  const start = code.indexOf(`function ${name}(`);
  expect(start, `${name} not found`).toBeGreaterThanOrEqual(0);
  const next = code.indexOf('\nfunction ', start + 1);
  const nextExport = code.indexOf('\nexport function ', start + 1);
  const ends = [next, nextExport].filter(index => index > start);
  return code.slice(start, ends.length ? Math.min(...ends) : undefined);
}

describe('chat transcript virtualization under React Compiler', {
  timeout: 30_000,
}, () => {
  it.each([
    ['JovieChat.tsx', 'JovieChat'],
    ['JovieChatSections.tsx', 'ChatThreadMessages'],
  ])(
    '%s leaves %s uncompiled so rows follow the scroll position',
    (file, name) => {
      const body = functionBody(compile(file), name);
      expect(body).toContain('virtualizer');
      expect(body).not.toMatch(/\b_c\(\d+\)/);
    }
  );

  it('still compiles components that do not read virtualizer state', () => {
    const body = functionBody(
      compile('JovieChatSections.tsx'),
      'ChatInlineError'
    );
    expect(body).toMatch(/\b_c\(\d+\)/);
  });
});
