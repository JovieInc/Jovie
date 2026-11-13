import { execFileSync } from 'node:child_process';
import {
  cp,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  symlink,
  writeFile,
} from 'node:fs/promises';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { gzipSync } from 'node:zlib';
import {
  compareToBaseline,
  tightenBaseline,
} from '../../../scripts/lib/shrink-only-baseline.mjs';
import { bundleDesktopPreload } from './bundle-preload.mjs';
import { bakeDesktopEnvAndIdentity } from './write-env.mjs';

const desktopRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..'
);
const require = createRequire(import.meta.url);
export const BASELINE_FILE = 'apps/desktop/scripts/bundle-size.json';
const files = ['main.js', 'preload.js'];

export function assertSizes(current, baseline, baseBaseline = baseline) {
  for (const value of [current, baseline, baseBaseline]) {
    if (
      Object.keys(value).sort().join() !== files.join() ||
      Object.values(value).some(n => !Number.isSafeInteger(n) || n <= 0)
    )
      throw new Error(
        'Expected positive gzip byte sizes for main.js and preload.js'
      );
  }
  if (compareToBaseline(baseline, baseBaseline).growth.length)
    throw new Error('Bundle baseline may only shrink');
  const { growth } = compareToBaseline(current, baseline);
  if (growth.length)
    throw new Error(`Gzip bundle grew: ${JSON.stringify(growth)}`);
}

export async function measureBundles() {
  const root = await mkdtemp(path.join(tmpdir(), 'jovie-bundle-size-'));
  try {
    await cp(path.join(desktopRoot, 'src'), path.join(root, 'src'), {
      recursive: true,
    });
    await mkdir(path.join(root, 'build'));
    await symlink(
      path.join(desktopRoot, 'node_modules'),
      path.join(root, 'node_modules'),
      'dir'
    );
    // Real local build, deliberately unbound: no timestamp/SHA entropy. The
    // release version and all product code still come from the current tree.
    bakeDesktopEnvAndIdentity({
      outputRoot: root,
      env: {
        ELECTRON_ENV: 'local',
        ELECTRON_APP_URL: 'http://127.0.0.1:3100',
        JOVIE_DESKTOP_DISABLE_GIT: '1',
      },
    });
    await writeFile(
      path.join(root, 'tsconfig.json'),
      JSON.stringify({
        extends: path.join(desktopRoot, 'tsconfig.json'),
        compilerOptions: { rootDir: './src', outDir: './dist' },
        include: ['src/**/*.ts'],
        exclude: ['node_modules', 'dist'],
      })
    );
    execFileSync(
      process.execPath,
      [
        require.resolve('typescript/bin/tsc'),
        '-p',
        path.join(root, 'tsconfig.json'),
      ],
      { stdio: 'pipe' }
    );
    await bundleDesktopPreload({
      absWorkingDir: root,
      entryPoint: path.join(root, 'src/preload.ts'),
      outfile: path.join(root, 'dist/preload.js'),
    });
    return Object.fromEntries(
      await Promise.all(
        files.map(async file => [
          file,
          gzipSync(await readFile(path.join(root, 'dist', file)), { level: 9 })
            .length,
        ])
      )
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

export function readBaseBaseline(
  base = process.env.GITHUB_BASE_REF || 'main',
  cwd = desktopRoot
) {
  const branch = base.trim() || 'main';
  const ref = branch.startsWith('origin/') ? branch : `origin/${branch}`;
  // Distinguish the initial introduction from an unreadable base/ref.
  const entries = execFileSync(
    'git',
    ['ls-tree', '--full-tree', '--name-only', ref, '--', BASELINE_FILE],
    { cwd, encoding: 'utf8' }
  );
  if (!entries.trim()) return null;
  return JSON.parse(
    execFileSync('git', ['show', `${ref}:${BASELINE_FILE}`], {
      cwd,
      encoding: 'utf8',
    })
  );
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href
) {
  const measured = await measureBundles();
  if (process.argv.includes('--tighten')) {
    const file = path.join(desktopRoot, 'scripts/bundle-size.json');
    const baseline = JSON.parse(await readFile(file, 'utf8'));
    assertSizes(measured, baseline, readBaseBaseline() ?? baseline);
    await writeFile(
      file,
      `${JSON.stringify(tightenBaseline(measured, baseline).baseline, null, 2)}\n`
    );
  }
  console.log(JSON.stringify(measured, null, 2));
}
