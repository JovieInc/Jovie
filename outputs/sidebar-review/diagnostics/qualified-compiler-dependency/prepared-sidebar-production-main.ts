import { createRequire } from 'node:module';
import path from 'node:path';
import base, { storybookAddonsForEnvironment } from '../../.storybook/main';
const require = createRequire(import.meta.url);
export default {
  ...base,
  addons: storybookAddonsForEnvironment(true),
  stories: [path.resolve(__dirname, '../../components/organisms/UnifiedSidebar.stories.tsx')],
  typescript: { check: false, reactDocgen: false },
  async viteFinal(config: any, options: any) {
    const result = await base.viteFinal!(config, options);
let isProductionBuild = false;
    const rewriteNextReactPlugin = {
      name: 'jovie-storybook-rewrite-next-react',
      enforce: 'pre' as const,
      configResolved(resolved: { command: string }) {
        isProductionBuild = resolved.command === 'build';
      },
      async resolveId(
        this: {
          resolve: (
            source: string,
            importer: string | undefined,
            options: { skipSelf?: boolean }
          ) => Promise<{ id: string } | null>;
        },
        source: string,
        importer: string | undefined
      ) {
        const normalized = source.replace(/\\/g, '/');
        if (!normalized.includes('next/dist/compiled/react')) {
          return null;
        }

        let bare: string | null = null;
        // `next/dist/compiled/react-dom/client` contains `.../react-dom`, so
        // the client path must win. Mapping it to bare `react-dom` drops
        // createRoot and Storybook's react-18 shim throws in production.
        if (
          normalized.includes('next/dist/compiled/react-dom/client') ||
          normalized.includes(
            'next/dist/compiled/react-dom/cjs/react-dom-client'
          )
        ) {
          bare = 'react-dom/client';
        } else if (normalized.includes('next/dist/compiled/react-dom')) {
          bare = 'react-dom';
        } else if (
          normalized.includes('next/dist/compiled/react/jsx-dev-runtime')
        ) {
          bare = 'react/jsx-dev-runtime';
        } else if (
          normalized.includes('next/dist/compiled/react/jsx-runtime')
        ) {
          bare = 'react/jsx-runtime';
        } else if (
          normalized.includes('next/dist/compiled/react/index.js') ||
          normalized.endsWith('next/dist/compiled/react') ||
          normalized.includes('next/dist/compiled/react.js')
        ) {
          bare = 'react';
        }

        if (!bare) return null;

        // Production's native resolver does not carry nested skipSelf calls
        // across plugins. Next's bare -> compiled alias and this compiled ->
        // bare rewrite otherwise recurse indefinitely. Resolve to a terminal
        // workspace entry; keep the existing named-client interop module.
        // Dev still needs bare resolution for optimizeDeps CJS interop.
        if (isProductionBuild) {
          return {
            id:
              bare === 'react-dom/client'
                ? '\0jovie-react-dom-client'
                : require.resolve(bare),
          };
        }
        return this.resolve(bare, importer, { skipSelf: true });
      },
    };
    const plugins = (result.plugins ?? []).flat(Infinity);
    const matches = plugins.filter((plugin: any) => plugin?.name === rewriteNextReactPlugin.name);
    if (matches.length !== 1) throw new Error('Expected exactly one maintained React resolver');
    return { ...result, plugins: plugins.map((plugin: any) =>
      plugin?.name === rewriteNextReactPlugin.name ? rewriteNextReactPlugin : plugin) };
  },
};
