import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const desktopRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const webRoot = join(desktopRoot, '..', 'web');
const webRequire = createRequire(join(webRoot, 'package.json'));
const postcss = webRequire('postcss');
const tailwind = webRequire('@tailwindcss/postcss');
const output = join(desktopRoot, 'dist-electron', 'page-tabs');
await mkdir(output, { recursive: true });
await build({
  bundle: true,
  entryPoints: [join(webRoot, 'components/desktop/PageTabsChrome.tsx')],
  outfile: join(output, 'page-tabs.js'),
  platform: 'browser',
  target: 'chrome150',
  jsx: 'automatic',
  define: { 'process.env.NODE_ENV': '"production"' },
  tsconfig: join(webRoot, 'tsconfig.json'),
  minify: true,
});
const from = join(webRoot, 'components/desktop/page-tabs-chrome.css');
const css = await postcss([tailwind({ base: webRoot })]).process(
  await readFile(from, 'utf8'),
  { from }
);
await writeFile(join(output, 'page-tabs.css'), css.css);
await writeFile(
  join(output, 'index.html'),
  `<!doctype html><html data-desktop-runtime="electron"><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline'; font-src 'self'; img-src 'self' data:;"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="page-tabs.css"><title>Open pages</title></head><body><div id="page-tabs"></div><script src="page-tabs.js"></script></body></html>`
);
