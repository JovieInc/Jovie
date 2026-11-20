// Preload for operator scripts that call app server modules from plain Node:
// `server-only` is a no-op and `next/cache` has no static-generation store, so
// cache invalidation becomes a no-op (the script is not a Next request; the
// public ISR window refreshes the page on its own).
import { registerHooks } from 'node:module';
import { pathToFileURL } from 'node:url';

const dir = new URL('./shims/', import.meta.url);
const shims = {
  'server-only': pathToFileURL(new URL('server-only.mjs', dir).pathname).href,
  'next/cache': pathToFileURL(new URL('next-cache.mjs', dir).pathname).href,
};

registerHooks({
  resolve(specifier, context, nextResolve) {
    const url = shims[specifier];
    return url === undefined
      ? nextResolve(specifier, context)
      : { url, shortCircuit: true };
  },
});
