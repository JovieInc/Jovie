import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { gzipSync } from 'node:zlib';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';

/**
 * Marketing motion budgets (JOV-7757). Sizes are measured on comment-free
 * transpiled output, gzip -9: an upper bound on what minification ships, so
 * the budget can't pass locally and fail in a production build.
 */
const MOTION_DIR = join(__dirname);

const BUDGETS_GZIP_BYTES = {
  // The WebGL2 layer, loaded as its own chunk after idle.
  'ambient-field-gl.ts': 3 * 1024,
  // The island that ships with the page: poster markup plus gating.
  'MarketingAmbientField.tsx': 2 * 1024,
} as const;

function transpiledGzipBytes(file: string): number {
  const source = readFileSync(join(MOTION_DIR, file), 'utf8');
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: {
      jsx: ts.JsxEmit.ReactJSX,
      module: ts.ModuleKind.ESNext,
      removeComments: true,
      target: ts.ScriptTarget.ES2022,
    },
  });
  return gzipSync(outputText, { level: 9 }).byteLength;
}

describe('marketing motion budgets', () => {
  it.each(Object.entries(BUDGETS_GZIP_BYTES))(
    '%s stays within its gzip budget',
    (file, budget) => {
      expect(transpiledGzipBytes(file)).toBeLessThanOrEqual(budget);
    }
  );

  it('loads the GL layer lazily, never in the page chunk', () => {
    const island = readFileSync(
      join(MOTION_DIR, 'MarketingAmbientField.tsx'),
      'utf8'
    );
    const staticImports = island.match(
      /^import\s+(?!type\b)[^;]*from\s+['"]\.\/ambient-field-gl['"]/gm
    );

    expect(staticImports).toBeNull();
    expect(island).toContain("import('./ambient-field-gl')");
  });
});
