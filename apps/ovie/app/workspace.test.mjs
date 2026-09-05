import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const tailwind = require('@tailwindcss/postcss');
const postcss = createRequire(require.resolve('@tailwindcss/postcss'))(
  'postcss'
);

it('compiles responsive shared-shell utilities from the Ovie workspace', async () => {
  const from = fileURLToPath(new URL('./workspace.css', import.meta.url));
  const result = await postcss([tailwind()]).process(
    await readFile(from, 'utf8'),
    {
      from,
    }
  );
  // Without an explicit shared-source scan the generated adapters contain no
  // utility classes: desktop navigation and mobile navigation render together.
  expect(result.css).toContain('.md\\:hidden');
  expect(result.css).toContain('.md\\:flex');
  expect(result.css).toContain('.grid-cols-3');
}, 30_000);
