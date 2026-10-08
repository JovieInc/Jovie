import { createRequire } from 'node:module';
import { describe, expect, it, vi } from 'vitest';
import config from '../../../.storybook/main';

const requireFromHere = createRequire(import.meta.url);

describe('Storybook production React resolution', () => {
  it('terminates build aliases, retains client interop and keeps dev prebundling', async () => {
    const viteFinal = config.viteFinal;
    if (!viteFinal) throw new Error('Storybook must define viteFinal');
    const vite = await viteFinal({}, { configType: 'PRODUCTION' } as Parameters<
      typeof viteFinal
    >[1]);
    const plugin = vite?.plugins?.find(
      candidate =>
        candidate &&
        typeof candidate === 'object' &&
        'name' in candidate &&
        candidate.name === 'jovie-storybook-rewrite-next-react'
    ) as {
      configResolved(config: { command: string }): void;
      resolveId(
        source: string,
        importer?: string
      ): Promise<{ id: string } | null>;
    };
    expect(plugin).toBeDefined();
    const resolve = vi.fn(async (bare: string) => ({ id: bare }));
    plugin.configResolved({ command: 'build' });
    for (const bare of [
      'react',
      'react/jsx-runtime',
      'react/jsx-dev-runtime',
      'react-dom',
    ]) {
      expect(
        await plugin.resolveId.call({ resolve }, `next/dist/compiled/${bare}`)
      ).toEqual({
        id: requireFromHere.resolve(bare),
      });
    }
    expect(
      await plugin.resolveId.call(
        { resolve },
        'next/dist/compiled/react-dom/client'
      )
    ).toEqual({
      id: '\0jovie-react-dom-client',
    });
    expect(resolve).not.toHaveBeenCalled();
    const requireFromVite = createRequire(requireFromHere.resolve('vite'));
    const { rolldown } = await import(requireFromVite.resolve('rolldown'));
    const trace: string[] = [];
    const record = (hook: string) => {
      trace.push(hook);
      if (trace.length > 16) throw new Error('bounded native resolver cycle');
    };
    const bundle = await rolldown({
      input: 'entry',
      plugins: [
        {
          name: 'bounded-entry',
          resolveId(id: string) {
            if (id === 'entry') return '\0entry';
          },
          load(id: string) {
            if (id === '\0entry')
              return "import value from 'react'; export default value;";
            if (id === requireFromHere.resolve('react'))
              return 'export default 42;';
          },
        },
        {
          name: 'pinned-next-react-alias',
          async resolveId(
            this: {
              resolve: (
                id: string,
                importer?: string,
                options?: unknown
              ) => unknown;
            },
            id: string,
            importer?: string,
            options?: unknown
          ) {
            if (id !== 'react') return null;
            record('alias');
            return this.resolve(
              '/fixture/next/dist/compiled/react/index.js',
              importer,
              options
            );
          },
        },
        {
          ...plugin,
          async resolveId(this: unknown, id: string, importer?: string) {
            record('rewrite');
            return plugin.resolveId.call(this, id, importer);
          },
        },
      ],
    });
    try {
      const result = await bundle.generate({ format: 'es' });
      expect(result.output[0].code).toContain('42');
      expect(trace).toEqual(['alias', 'rewrite']);
    } finally {
      await bundle.close();
    }
    plugin.configResolved({ command: 'serve' });
    expect(
      await plugin.resolveId.call(
        { resolve },
        'next/dist/compiled/react-dom/client'
      )
    ).toEqual({
      id: 'react-dom/client',
    });
    expect(resolve).toHaveBeenCalledExactlyOnceWith(
      'react-dom/client',
      undefined,
      { skipSelf: true }
    );
    expect(await plugin.resolveId.call({ resolve }, 'unrelated')).toBeNull();
  });
});
