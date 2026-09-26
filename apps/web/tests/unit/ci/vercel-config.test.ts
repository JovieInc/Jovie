import { spawnSync } from 'node:child_process';
import {
  chmodSync,
  existsSync,
  globSync,
  mkdtempSync,
  readFileSync,
  writeFileSync,
} from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runInNewContext } from 'node:vm';
import { describe, expect, it } from 'vitest';

const testDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(testDir, '..', '..', '..', '..', '..');
const repoRequire = createRequire(resolve(repoRoot, 'package.json'));
const appWebRoot = resolve(repoRoot, 'apps/web');
const vercelRequire = createRequire(repoRequire.resolve('vercel/package.json'));
const buildUtilsEntry = vercelRequire.resolve('@vercel/build-utils');
const buildUtilsRequire = createRequire(buildUtilsEntry);
const { default: getIgnoreFilter } = buildUtilsRequire(
  resolve(dirname(buildUtilsEntry), 'get-ignore-filter.js')
) as {
  default: (
    downloadPath: string,
    rootDirectory?: string
  ) => Promise<(filePath: string) => boolean>;
};

type VercelConfig = {
  functions?: Record<string, unknown>;
  ignoreCommand?: string;
};

type NextConfigForTest = {
  outputFileTracingRoot?: string;
  outputFileTracingIncludes?: Record<string, string[]>;
  outputFileTracingExcludes?: Record<string, string[]>;
};

type Picomatch = (
  glob: string | string[],
  options: { dot: boolean; contains: boolean }
) => (input: string) => boolean;

function readVercelConfig(relativePath: string): VercelConfig {
  const configPath = resolve(repoRoot, relativePath);
  return JSON.parse(readFileSync(configPath, 'utf8')) as VercelConfig;
}

function loadNextConfigForTracingTest(vercelEnv = ''): NextConfigForTest {
  const configPath = resolve(repoRoot, 'apps/web/next.config.js');
  const configDirectory = dirname(configPath);
  const configModule: { exports: NextConfigForTest } = { exports: {} };
  const identityConfig = (config: unknown) => config;
  const configRequire = (specifier: string): unknown => {
    switch (specifier) {
      case 'path':
        return repoRequire('node:path');
      case '../../version.json':
        return JSON.parse(
          readFileSync(resolve(configDirectory, specifier), 'utf8')
        );
      case '@next/bundle-analyzer':
        return () => identityConfig;
      case 'workflow/next':
        return { withWorkflow: identityConfig };
      case '@vercel/toolbar/plugins/next':
        return () => identityConfig;
      case '@sentry/nextjs':
        return { withSentryConfig: identityConfig };
      default:
        throw new Error(`Unexpected next.config.js dependency: ${specifier}`);
    }
  };

  runInNewContext(
    readFileSync(configPath, 'utf8'),
    {
      __dirname: configDirectory,
      exports: configModule.exports,
      module: configModule,
      process: {
        env: {
          ANALYZE: 'false',
          CI: 'false',
          NODE_ENV: 'test',
          NEXT_ENABLE_TOOLBAR: '0',
          VERCEL_ENV: vercelEnv,
        },
      },
      require: configRequire,
    },
    { filename: configPath }
  );

  const copyRouteGlobs = (globs?: Record<string, string[]>) =>
    globs
      ? Object.fromEntries(
          Object.entries(globs).map(([route, paths]) => [route, [...paths]])
        )
      : undefined;
  return {
    outputFileTracingRoot: configModule.exports.outputFileTracingRoot,
    outputFileTracingIncludes: copyRouteGlobs(
      configModule.exports.outputFileTracingIncludes
    ),
    outputFileTracingExcludes: copyRouteGlobs(
      configModule.exports.outputFileTracingExcludes
    ),
  };
}

// Models turbo-tasks-fs globset.rs for the glob subset trace excludes use,
// after next-core relativize_glob strips `../` against the app dir.
function turbopackGlobSource(exclude: string): string {
  let root = 'apps/web';
  let glob = exclude;
  while (glob.startsWith('../') || glob.startsWith('./')) {
    if (glob.startsWith('../')) {
      root = root.includes('/') ? dirname(root) : '';
      glob = glob.slice(3);
    } else {
      glob = glob.slice(2);
    }
  }
  const pattern = root ? `${root}/${glob}` : glob;
  // Turbopack has no extglobs: `!(x)` would silently match nothing.
  if (/[{}?\\()]/.test(pattern)) {
    throw new Error(
      `Trace exclude outside the modeled glob subset: ${pattern}`
    );
  }
  return pattern
    .split(/(\*\*|\*|\[!?[^\]]+\])/)
    .map(token => {
      if (token === '**') return '.*';
      if (token === '*') return '[^/]*';
      if (token.startsWith('[')) return token.replace('[!', '[^');
      return token.replace(/[.+^$|[\]]/g, '\\$&');
    })
    .join('');
}

describe('Vercel function config', () => {
  it.each(['', 'preview', 'production'])(
    'keeps every tracing include inside the trace root (VERCEL_ENV=%s)',
    vercelEnv => {
      // Preview/staging builds (promoted to production) once left the root
      // unset, so '../../' includes escaped it and Vercel failed at
      // "Extracting deployment files" (prod frozen 2026-09-21..26).
      const nextConfig = loadNextConfigForTracingTest(vercelEnv);
      const traceRoot = nextConfig.outputFileTracingRoot;
      expect(traceRoot).toBeTruthy();
      const appDirectory = resolve(repoRoot, 'apps/web');
      for (const globs of Object.values(
        nextConfig.outputFileTracingIncludes ?? {}
      )) {
        for (const glob of globs) {
          const fromRoot = relative(
            resolve(traceRoot as string),
            resolve(appDirectory, glob)
          );
          expect(fromRoot.startsWith('..'), glob).toBe(false);
        }
      }
    }
  );

  it('uses App Router function globs that Vercel can match', () => {
    const configs = ['vercel.json', 'apps/web/vercel.json'];

    for (const configPath of configs) {
      const functionGlobs = Object.keys(
        readVercelConfig(configPath).functions ?? {}
      );

      expect(functionGlobs.length, `${configPath} functions`).toBeGreaterThan(
        0
      );
      expect(functionGlobs, configPath).not.toContain('app/api/**/*.ts');
      expect(functionGlobs, configPath).not.toContain(
        'apps/web/app/api/**/*.ts'
      );
      expect(functionGlobs, configPath).not.toContain('apps/web/app/api/**/*');
      expect(functionGlobs, configPath).not.toContain(
        'apps/web/app/api/cron/**/*'
      );
      expect(
        functionGlobs.every(
          glob => glob.startsWith('app/api/') && glob.endsWith('/**/*')
        ),
        configPath
      ).toBe(true);
    }
  });

  it('always builds production branches and skips every other ref', () => {
    const configs = ['vercel.json', 'apps/web/vercel.json'];
    const ignoreCommands = configs.map(configPath => {
      const command = readVercelConfig(configPath).ignoreCommand;
      expect(command, configPath).toBeTypeOf('string');
      return command as string;
    });

    expect(new Set(ignoreCommands).size).toBe(1);
    const ignoreCommand = ignoreCommands[0];
    const fakeBin = mkdtempSync(resolve(tmpdir(), 'jovie-vercel-ignore-'));
    const fakeNpx = resolve(fakeBin, 'npx');
    writeFileSync(
      fakeNpx,
      '#!/usr/bin/env bash\nprintf "%s\\n" "$*" > "$TURBO_IGNORE_CALL_LOG"\nexit "${TURBO_IGNORE_EXIT_CODE:-0}"\n'
    );
    chmodSync(fakeNpx, 0o755);

    const runIgnoreCommand = (ref: string, exitCode = '0') => {
      const callLog = resolve(fakeBin, `${ref.replaceAll('/', '-')}.log`);
      const result = spawnSync('bash', ['-c', ignoreCommand], {
        env: {
          ...process.env,
          PATH: `${fakeBin}:${process.env.PATH ?? ''}`,
          TURBO_IGNORE_CALL_LOG: callLog,
          TURBO_IGNORE_EXIT_CODE: exitCode,
          VERCEL_GIT_COMMIT_REF: ref,
        },
        encoding: 'utf8',
      });

      return { callLog, result };
    };

    for (const ref of ['main', 'production']) {
      const { callLog, result } = runIgnoreCommand(ref);
      expect(result.status, ref).toBe(1);
      expect(existsSync(callLog), ref).toBe(false);
    }

    for (const ref of [
      'docs-only',
      'codex/docs-only',
      'claude/docs-only',
      'codegen-bot/docs-only',
      'linear/docs-only',
    ]) {
      const { callLog, result } = runIgnoreCommand(ref);
      // JOV-5941: PR refs never build or deploy — the ignore command must
      // exit 0 on its own without delegating to `npx turbo-ignore`, so the
      // fake-npx call log staying unwritten is the assertion.
      expect(result.status, ref).toBe(0);
      expect(existsSync(callLog), ref).toBe(false);
    }
  });

  it('uploads the runtime quarantine ledger without uploading test artifacts', async () => {
    const isIgnored = await getIgnoreFilter(repoRoot);

    expect(isIgnored('apps/web/tests')).toBe(false);
    expect(isIgnored('apps/web/tests/quarantine.json')).toBe(false);
    expect(isIgnored('apps/web/tests/fixtures/seo-ratchet-baseline.json')).toBe(
      true
    );
    expect(
      isIgnored('apps/web/tests/unit/ci/fixtures/skip-success-unbound.json')
    ).toBe(true);
    expect(
      isIgnored('apps/web/tests/unit/lib/testing/quarantine-ledger.test.ts')
    ).toBe(true);
    expect(isIgnored('apps/web/tests/e2e/smoke-manifest.ts')).toBe(true);
    expect(isIgnored('apps/web/lib/testing/quarantine-ledger.server.ts')).toBe(
      false
    );
  });

  it('uploads only the allowlisted source-read runtime data', async () => {
    const isIgnored = await getIgnoreFilter(repoRoot);
    const runtimePaths = [
      'CHANGELOG.md',
      'docs/FEATURE_REGISTRY.md',
      'scripts/symphony/symphony-codex-account-control.py',
      'apps/eve-pilot/identities/jovie/instructions.md',
      'apps/eve-pilot/identities/summer/instructions.md',
      'apps/web/content/legal/cookies.md',
      'apps/web/lib/chat/knowledge/topics/monetization.md',
      'apps/web/public/fonts/Satoshi-Bold.ttf',
      'apps/web/public/fonts/DMSans-Regular.ttf',
    ];
    const excludedPaths = [
      'apps/web/lib/services/retouching/styles/white-space.md',
      'docs/ordinary-reference.md',
      'scripts/symphony/unrelated-helper.py',
      'apps/web/lib/services/retouching/styles/other-style.md',
      'apps/web/tests/fixtures/private-fixture.json',
    ];

    for (const runtimePath of runtimePaths) {
      expect(isIgnored(runtimePath), runtimePath).toBe(false);
    }
    for (const excludedPath of excludedPaths) {
      expect(isIgnored(excludedPath), excludedPath).toBe(true);
    }
  });

  it('keeps dynamic runtime readers covered by bounded Next trace includes', () => {
    const nextConfig = loadNextConfigForTracingTest();
    const includesByRoute = nextConfig.outputFileTracingIncludes ?? {};
    const includes = includesByRoute['/*'] ?? [];

    expect(includes).toEqual(
      expect.arrayContaining([
        '../../CHANGELOG.md',
        '../../docs/FEATURE_REGISTRY.md',
        '../../scripts/symphony/symphony-codex-account-control.py',
        '../../apps/eve-pilot/identities/jovie/instructions.md',
        '../../apps/eve-pilot/identities/summer/instructions.md',
        'tests/quarantine.json',
        'content/**/*',
        'lib/chat/knowledge/topics/**/*',
        'public/fonts/Satoshi-Bold.ttf',
        'public/fonts/DMSans-Regular.ttf',
      ])
    );
    expect(includes.some(include => include.includes('node_modules'))).toBe(
      false
    );
    expect(includes).not.toContain('**/*');

    const screenshotIncludes = [
      'screenshot-catalog/current/**/*',
      'public/product-screenshots/**/*',
    ];
    expect(includesByRoute['/app/admin/screenshots']).toEqual(
      expect.arrayContaining(screenshotIncludes)
    );
    expect(includesByRoute['/api/admin/screenshots/**']).toEqual(
      expect.arrayContaining(screenshotIncludes)
    );
    expect(includes).not.toEqual(expect.arrayContaining(screenshotIncludes));
  });

  it('excludes non-runtime repo files from traces without dropping runtime reads', () => {
    const nextConfig = loadNextConfigForTracingTest();
    const excludesByRoute = nextConfig.outputFileTracingExcludes ?? {};
    // '**' is the only route glob that also matches the root route '/'.
    expect(Object.keys(excludesByRoute)).toEqual(['**']);
    const excludes = excludesByRoute['**'] ?? [];
    expect(excludes).toEqual(
      expect.arrayContaining(['tests/[^q]*', 'tests/*/**', 'drizzle/**'])
    );

    // `next build --turbopack` filters traced modules in Rust (next-api nft.rs):
    // excludes are relativized to the repo root and matched unanchored against
    // repo-relative paths. Webpack builds use collect-build-traces.js instead:
    // excludes joined to the app dir, matched with picomatch.
    const turbopackExclude = new RegExp(
      excludes.map(turbopackGlobSource).join('|')
    );
    const picomatch = createRequire(resolve(appWebRoot, 'package.json'))(
      'next/dist/compiled/picomatch'
    ) as Picomatch;
    const webpackExclude = picomatch(
      excludes.map(exclude => resolve(appWebRoot, exclude)),
      { dot: true, contains: true }
    );
    const excludedBy = (repoPath: string) => ({
      turbopack: turbopackExclude.test(repoPath),
      webpack: webpackExclude(resolve(repoRoot, repoPath)),
    });

    const includedRuntimeFiles = Object.values(
      nextConfig.outputFileTracingIncludes ?? {}
    )
      .flat()
      .flatMap(include => globSync(include, { cwd: appWebRoot }))
      .map(file => relative(repoRoot, resolve(appWebRoot, file)));
    expect(includedRuntimeFiles).toEqual(
      expect.arrayContaining([
        'CHANGELOG.md',
        'docs/FEATURE_REGISTRY.md',
        'apps/web/tests/quarantine.json',
        'apps/web/screenshot-catalog/current/manifest.json',
      ])
    );

    // Include-listed files plus other files request-time code reads.
    const runtimeReads = [
      ...includedRuntimeFiles,
      'apps/web/lib/seo/ratchet-baseline.json',
      'apps/web/lib/eval/holdout.json',
      'apps/web/public/fonts/Inter-Latin.woff2',
      'apps/web/public/brand/Jovie-Wordmark-Cream.svg',
      'apps/web/lib/testing/quarantine-ledger.server.ts',
      'node_modules/.pnpm/node_modules/drizzle-orm/index.js',
    ];
    for (const runtimePath of runtimeReads) {
      expect(excludedBy(runtimePath), runtimePath).toEqual({
        turbopack: false,
        webpack: false,
      });
    }

    const tracedNoise = [
      'apps/web/tests/e2e/__snapshots__/auth-visual.spec.ts/signin-page-desktop.png',
      'apps/web/tests/unit/design-system/raw-button.baseline.json',
      'apps/web/tests/critical-component-map.json',
      'apps/web/drizzle/migrations/meta/0000_snapshot.json',
      'apps/web/reports/test-coverage-snapshot.json',
      'apps/web/eslint-rules/shadcn-no-restyle.options.json',
    ];
    for (const noisePath of tracedNoise) {
      expect(excludedBy(noisePath), noisePath).toEqual({
        turbopack: true,
        webpack: true,
      });
    }
  });

  it('opts whole-project filesystem readers out of Turbopack tracing', () => {
    const tracedCallSites: Array<{ file: string; callees: string[] }> = [
      {
        file: 'apps/web/lib/filesystem-paths.ts',
        callees: ['path.resolve', 'path.join'],
      },
      {
        file: 'apps/web/lib/ovie/identity.ts',
        callees: ['resolve', 'existsSync', 'readFileSync'],
      },
      {
        file: 'apps/web/lib/ovie/mcp/artist-profile-inventory.ts',
        callees: ['resolve', 'readFileSync'],
      },
      {
        file: 'apps/web/lib/changelog-source.ts',
        callees: ['fs.existsSync', 'fs.readFileSync'],
      },
      {
        file: 'apps/web/lib/testing/quarantine-ledger.server.ts',
        callees: ['resolve', 'readFileSync'],
      },
    ];

    for (const { file, callees } of tracedCallSites) {
      const source = readFileSync(resolve(repoRoot, file), 'utf8');
      const pattern = new RegExp(
        `\\b(?:${callees.map(callee => callee.replaceAll('.', '\\.')).join('|')})\\(`,
        'g'
      );
      const misses: string[] = [];
      for (const match of source.matchAll(pattern)) {
        const argument = source.slice((match.index ?? 0) + match[0].length);
        if (!argument.trimStart().startsWith('/* turbopackIgnore: true */')) {
          const line = source.slice(0, match.index).split('\n').length;
          misses.push(`${file}:${line} ${match[0]}`);
        }
      }

      expect(misses, file).toEqual([]);
    }
  });
});
