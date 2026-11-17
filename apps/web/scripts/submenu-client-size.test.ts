// @vitest-environment node
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { gzipSync } from 'node:zlib';
import { JsxEmit, ModuleKind, transpileModule } from 'typescript';
import { expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const babel = require('next/dist/compiled/babel/core');
const swc = require('next/dist/build/swc');

it.each([
  ['common-dropdown-submenu-layout.ts', 1100],
  ['common-dropdown-item-renderers.tsx', 1700],
  ['common-dropdown-renderer.tsx', 2450],
] as const)(
  'keeps compiled %s below its initial-client byte allowance',
  async (file, maxGzipBytes) => {
    const filename = resolve(__dirname, '../../../packages/ui/atoms', file);
    const compiled = babel.transformSync(readFileSync(filename, 'utf8'), {
      filename,
      babelrc: false,
      configFile: false,
      plugins: [
        [require.resolve('babel-plugin-react-compiler'), {}],
        require.resolve('next/dist/compiled/babel/plugin-syntax-jsx'),
        [
          require.resolve('next/dist/compiled/babel/plugin-syntax-typescript'),
          { isTSX: file.endsWith('tsx') },
        ],
      ],
    });
    const executable = transpileModule(compiled.code, {
      compilerOptions: { jsx: JsxEmit.ReactJSX, module: ModuleKind.ESNext },
    }).outputText;
    await swc.loadBindings();
    const minified = await swc.minify(executable, {
      module: true,
      compress: true,
      mangle: true,
    });
    // Actual compiler/minifier output, not source text or an import assertion.
    // These small shared renderers are carried by eager CommonDropdown consumers.
    expect(gzipSync(minified.code, { level: 9 }).length).toBeLessThanOrEqual(
      maxGzipBytes
    );
  }
);
