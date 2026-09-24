import { spawnSync } from 'node:child_process';
import {
  chmodSync,
  existsSync,
  mkdtempSync,
  readFileSync,
  writeFileSync,
} from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runInNewContext } from 'node:vm';
import { describe, expect, it } from 'vitest';

const testDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(testDir, '..', '..', '..', '..', '..');
const repoRequire = createRequire(resolve(repoRoot, 'package.json'));
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
  outputFileTracingIncludes?: Record<string, string[]>;
};

function readVercelConfig(relativePath: string): VercelConfig {
  const configPath = resolve(repoRoot, relativePath);
  return JSON.parse(readFileSync(configPath, 'utf8')) as VercelConfig;
}

function loadNextConfigForTracingTest(): NextConfigForTest {
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
          VERCEL_ENV: '',
        },
      },
      require: configRequire,
    },
    { filename: configPath }
  );

  const includes = configModule.exports.outputFileTracingIncludes;
  return {
    outputFileTracingIncludes: includes
      ? Object.fromEntries(
          Object.entries(includes).map(([route, paths]) => [route, [...paths]])
        )
      : undefined,
  };
}

describe('Vercel function config', () => {
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
});
