import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * The signed-in shell mounts on every /app page, so whatever its modules import
 * statically is evaluated in the long hydration task of every signed-in cold
 * load (the product crawl's longest main-thread task). These shell modules
 * must not pull zod into that first-load graph; the validators load on demand
 * (server route, or with the first query read).
 */

interface EsbuildOutput {
  readonly entryPoint?: string;
  readonly imports: ReadonlyArray<{ path: string; kind: string }>;
  readonly inputs: Record<string, { bytesInOutput: number }>;
}

const require = createRequire(import.meta.url);
const esbuild = createRequire(require.resolve('vitest/package.json'))(
  'esbuild'
) as {
  build: (options: Record<string, unknown>) => Promise<{
    metafile: { outputs: Record<string, EsbuildOutput> };
  }>;
};

/** Zod bytes in the chunks a browser evaluates before any dynamic import. */
async function firstLoadZodBytes(contents: string): Promise<number> {
  const { metafile } = await esbuild.build({
    stdin: {
      contents,
      resolveDir: dirname(fileURLToPath(import.meta.url)),
      sourcefile: 'first-load-entry.ts',
    },
    bundle: true,
    splitting: true,
    format: 'esm',
    outdir: 'first-load-out',
    minify: true,
    platform: 'browser',
    write: false,
    metafile: true,
    logLevel: 'silent',
  });
  const outputs = metafile.outputs;
  const entry = Object.keys(outputs).find(
    key => outputs[key]?.entryPoint?.endsWith('first-load-entry.ts') ?? false
  );
  expect(entry).toBeDefined();
  const eager = new Set<string>();
  const pending = [entry as string];
  while (pending.length > 0) {
    const key = pending.pop() as string;
    if (eager.has(key)) continue;
    eager.add(key);
    for (const imported of outputs[key]?.imports ?? []) {
      if (imported.kind === 'import-statement') pending.push(imported.path);
    }
  }
  return [...eager]
    .flatMap(key => Object.entries(outputs[key]?.inputs ?? {}))
    .filter(([path]) => /[/\\]zod[/\\]/u.test(path))
    .reduce((total, [, input]) => total + input.bytesInOutput, 0);
}

describe('signed-in shell first-load boundary', () => {
  it('keeps zod out of the client navigation tracker', async () => {
    expect(
      await firstLoadZodBytes(`
        import { startNavigationTelemetry, trackNavigationImpressions } from '@/lib/tracking/navigation-telemetry';
        console.log(startNavigationTelemetry, trackNavigationImpressions);
      `)
    ).toBe(0);
  });

  it('keeps zod out of the shipping-state prefetch options', async () => {
    expect(
      await firstLoadZodBytes(`
        import { shippingStateQueryOptions } from '@/lib/queries/shipping-state';
        console.log(shippingStateQueryOptions.queryFn);
      `)
    ).toBe(0);
  });

  it('still bundles zod where payloads are validated', async () => {
    expect(
      await firstLoadZodBytes(`
        import { navigationTelemetryBatchSchema } from '@/lib/tracking/navigation-telemetry-schema';
        console.log(navigationTelemetryBatchSchema.safeParse(globalThis.INPUT));
      `)
    ).toBeGreaterThan(0);
  });

  it('keeps the motion-backed completion card a split chunk of the sidebar', () => {
    // The card's progress spring pulls in the whole motion library, and the
    // sidebar mounts on every signed-in page.
    const read = (file: string) =>
      readFileSync(join(__dirname, '../../components/organisms', file), 'utf8');
    const card = '@/features/dashboard/molecules/ProfileCompletionCard';
    expect(read('UnifiedSidebar.tsx')).not.toContain(`from '${card}'`);
    expect(read('unified-sidebar-lazy.ts')).toContain(
      `dynamic(() =>\n  import('${card}')`
    );
  });
});
