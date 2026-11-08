import { createRequire } from 'node:module';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * JOV-11623: the public profile failed production certification on its
 * longest blocked frame (376.6 ms, limit 200). Part of that frame is the
 * hydration work of evaluating every module the profile template imports
 * statically. This models it with esbuild: dynamic imports stay external
 * (separate chunks the browser fetches later), so the bundle is the code the
 * template evaluates before its first paint.
 */

interface EsbuildBuild {
  readonly metafile: {
    readonly outputs: Record<
      string,
      { readonly inputs: Record<string, { bytesInOutput: number }> }
    >;
  };
}

const require = createRequire(import.meta.url);
const esbuild = createRequire(require.resolve('vitest/package.json'))(
  'esbuild'
) as { build: (options: Record<string, unknown>) => Promise<EsbuildBuild> };

/** Bytes per input module that the entry evaluates before any dynamic import. */
async function firstLoadInputs(
  contents: string
): Promise<ReadonlyMap<string, number>> {
  const { metafile } = await esbuild.build({
    stdin: {
      contents,
      resolveDir: dirname(fileURLToPath(import.meta.url)),
      sourcefile: 'first-load-entry.tsx',
      loader: 'tsx',
    },
    bundle: true,
    format: 'esm',
    outdir: 'first-load-out',
    minify: true,
    platform: 'browser',
    write: false,
    metafile: true,
    logLevel: 'silent',
    jsx: 'automatic',
    define: { 'process.env.NODE_ENV': '"production"' },
    loader: { '.css': 'empty', '.svg': 'empty', '.png': 'empty' },
    external: [
      'react',
      'react/*',
      'react-dom',
      'react-dom/*',
      'next',
      'next/*',
      // Server modules a client graph reaches only through server actions.
      'node:*',
    ],
    plugins: [
      {
        name: 'dynamic-imports-load-later',
        setup(build: {
          onResolve: (
            options: { filter: RegExp },
            callback: (args: { path: string; kind: string }) => unknown
          ) => void;
        }) {
          build.onResolve({ filter: /.*/ }, args =>
            args.kind === 'dynamic-import'
              ? { path: args.path, external: true }
              : undefined
          );
        },
      },
    ],
  });
  const inputs = new Map<string, number>();
  for (const output of Object.values(metafile.outputs)) {
    for (const [path, input] of Object.entries(output.inputs)) {
      inputs.set(path, (inputs.get(path) ?? 0) + input.bytesInOutput);
    }
  }
  return inputs;
}

// The DOM renderer every motion.* component ships, and the layout-projection
// engine it drags in. m.* components defer both to LazyMotion features.
const MOTION_RENDERER =
  /framer-motion[/\\]dist[/\\]es[/\\]render[/\\]dom[/\\]create-visual-element/u;
const MOTION_PROJECTION =
  /motion-dom[/\\]dist[/\\]es[/\\]projection[/\\]node[/\\]/u;
const MOTION_PACKAGES =
  /[/\\](?:framer-motion|motion-dom|motion-utils|motion)[/\\]/u;

const has = (inputs: ReadonlyMap<string, number>, pattern: RegExp) =>
  [...inputs.keys()].some(path => pattern.test(path));
const bytes = (inputs: ReadonlyMap<string, number>, pattern: RegExp) =>
  [...inputs].reduce(
    (sum, [path, size]) => sum + (pattern.test(path) ? size : 0),
    0
  );

describe('public profile first-load boundary (JOV-11623)', () => {
  it('keeps the flagged desktop surface out of the profile template first load', async () => {
    const inputs = await firstLoadInputs(`
      import { ProfileCompactTemplate } from '@/features/profile/templates/ProfileCompactTemplate';
      console.log(ProfileCompactTemplate);
    `);
    expect(has(inputs, /templates[/\\]ProfileDesktopSurface\.tsx$/u)).toBe(
      false
    );
    // The desktop surface imported the unified drawer statically, defeating
    // the compact surface's mount-time drawer import.
    expect(has(inputs, /profile[/\\]ProfileUnifiedDrawer\.tsx$/u)).toBe(false);
  }, 30_000);

  it('keeps the motion engine out of the bottom tab bar first load', async () => {
    const inputs = await firstLoadInputs(`
      import { BottomTabBar } from '@/features/profile/nav/BottomTabBar';
      console.log(BottomTabBar);
    `);
    expect(has(inputs, MOTION_RENDERER)).toBe(false);
    expect(has(inputs, MOTION_PROJECTION)).toBe(false);
    // motion.span evaluated ~139 KB of motion; the hooks, LazyMotion and the
    // featureless m.span evaluate ~35 KB.
    expect(bytes(inputs, MOTION_PACKAGES)).toBeLessThan(48 * 1024);
  }, 30_000);

  it('still ships the lens renderer in its deferred features chunk', async () => {
    const inputs = await firstLoadInputs(`
      import features from '@/features/profile/nav/bottom-tab-bar-lens-features';
      console.log(features);
    `);
    expect(has(inputs, MOTION_RENDERER)).toBe(true);
  }, 30_000);
});
