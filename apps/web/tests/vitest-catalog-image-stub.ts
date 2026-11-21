import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import reactPlugin from '@vitejs/plugin-react';
import type { Plugin } from 'vite';

// Catalog screenshots live in R2 and are hydrated over the network
// (node scripts/screenshot-store.mjs hydrate). Unit tests only need the import
// to resolve, so when the real file is absent, resolve it to a placeholder URL
// instead of failing the whole test file. A hydrated file still wins.
const CATALOG_IMAGE = /screenshot-catalog\/current\/([\w.-]+\.png)$/;
const PREFIX = '\0catalog-image-stub:';

export function catalogImageStub(webRoot = process.cwd()): Plugin {
  return {
    name: 'jovie-catalog-image-stub',
    enforce: 'pre',
    resolveId(source) {
      const name = CATALOG_IMAGE.exec(source)?.[1];
      if (!name) return null;
      return existsSync(resolve(webRoot, 'screenshot-catalog/current', name))
        ? null
        : `${PREFIX}${name}`;
    },
    load(id) {
      if (!id.startsWith(PREFIX)) return null;
      return `export default ${JSON.stringify(`/__catalog-image-stub__/${id.slice(PREFIX.length)}`)};`;
    },
  };
}

/** Drop-in for `react()` in vitest configs: React plugin plus the catalog stub. */
export function react(...args: Parameters<typeof reactPlugin>) {
  return [reactPlugin(...args), catalogImageStub()];
}
