import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import {
  APP_FLAG_KEYS,
  APP_FLAG_TO_STATSIG_GATE,
  DESIGN_V1_ALIAS_FLAGS,
  LEGACY_STATSIG_GATE_KEYS,
} from '@/lib/flags/contracts';

const SOURCE_DIRECTORIES = ['app', 'components', 'hooks', 'lib'];
const SOURCE_EXTENSIONS = new Set(['.ts', '.tsx', '.js', '.jsx']);

const SKIP_DIRECTORIES = new Set([
  'node_modules',
  '__tests__',
  '.next',
  'dist',
  'build',
  'coverage',
]);

const APP_FLAG_CALL_REGEX =
  /\b(?:useAppFlag|useFeatureFlag|getAppFlagValue)\(\s*['"`]([A-Z0-9_]+)['"`]/g;
const EXP_ROUTE_IMPORT_REGEX =
  /\b(?:import|export)\b[\s\S]*?\bfrom\s*['"]@\/app\/exp(?:\/|['"])|\bimport\s*\(\s*['"]@\/app\/exp(?:\/|['"])/;

/** Stable package root resolved from this test file's location. */
const TEST_FILE_DIR = path.dirname(fileURLToPath(import.meta.url));
const WEB_ROOT = path.resolve(TEST_FILE_DIR, '../../..');

/**
 * Recursively collect source files from the given root directory, skipping
 * common generated/build folders to keep CI fast.
 */
function collectSourceFiles(rootDir: string): string[] {
  const files: string[] = [];

  function walk(currentPath: string): void {
    for (const entry of readdirSync(currentPath, { withFileTypes: true })) {
      if (entry.name.startsWith('.')) continue;
      if (SKIP_DIRECTORIES.has(entry.name)) continue;

      const fullPath = path.join(currentPath, entry.name);

      if (entry.isDirectory()) {
        walk(fullPath);
        continue;
      }

      if (SOURCE_EXTENSIONS.has(path.extname(entry.name))) {
        files.push(fullPath);
      }
    }
  }

  for (const dir of SOURCE_DIRECTORIES) {
    const absoluteDir = path.join(rootDir, dir);
    if (!existsSync(absoluteDir)) continue;
    walk(absoluteDir);
  }

  return files;
}

describe('feature flag registry integrity', () => {
  it('keeps all runtime app-flag references registered', () => {
    const sourceFiles = collectSourceFiles(WEB_ROOT);
    const registeredFlags = new Set<string>(Object.keys(APP_FLAG_KEYS));
    const discoveredFlags = new Set<string>();

    for (const sourceFile of sourceFiles) {
      const source = readFileSync(sourceFile, 'utf8');
      const matches = source.matchAll(APP_FLAG_CALL_REGEX);

      for (const [, flag] of matches) {
        discoveredFlags.add(flag);
      }
    }

    const unregisteredFlags = [...discoveredFlags]
      .filter(flag => !registeredFlags.has(flag))
      .sort();

    expect(unregisteredFlags).toEqual([]);
  });

  it('does not include API chat-specific feature flags in the registry', () => {
    const allowedShellRolloutEntries = new Set<string>([
      'DESIGN_V1',
      LEGACY_STATSIG_GATE_KEYS.DESIGN_V1,
      'SHELL_CHAT_V1',
      LEGACY_STATSIG_GATE_KEYS.SHELL_CHAT_V1,
      'DESIGN_V1_CHAT_ENTITIES',
      LEGACY_STATSIG_GATE_KEYS.DESIGN_V1_CHAT_ENTITIES,
    ]);
    const chatFlagsInKeys = Object.keys(LEGACY_STATSIG_GATE_KEYS).filter(
      key => /chat/i.test(key) && !allowedShellRolloutEntries.has(key)
    );
    const chatFlagsInValues = Object.values(LEGACY_STATSIG_GATE_KEYS).filter(
      flag => /chat/i.test(flag) && !allowedShellRolloutEntries.has(flag)
    );

    expect([...chatFlagsInKeys, ...chatFlagsInValues]).toEqual([]);
  });

  it('keeps new design surfaces backed by DESIGN_V1', () => {
    expect(APP_FLAG_KEYS.DESIGN_V1).toBe(LEGACY_STATSIG_GATE_KEYS.DESIGN_V1);
    expect(APP_FLAG_TO_STATSIG_GATE.DESIGN_V1).toBe(
      LEGACY_STATSIG_GATE_KEYS.DESIGN_V1
    );

    for (const aliasFlag of DESIGN_V1_ALIAS_FLAGS) {
      expect(APP_FLAG_KEYS[aliasFlag]).toBe(LEGACY_STATSIG_GATE_KEYS.DESIGN_V1);
      expect(APP_FLAG_TO_STATSIG_GATE[aliasFlag]).toBe(
        LEGACY_STATSIG_GATE_KEYS.DESIGN_V1
      );
    }
  });

  it('limits legacy feature-flags imports to static marketing and compatibility files', () => {
    const sourceFiles = collectSourceFiles(WEB_ROOT);
    const legacyImportRegex =
      /from ['"]@\/lib\/feature-flags\/(?:client|server|shared)['"]/;
    const allowedFiles = new Set([
      path.join('app', '(home)', 'page.tsx'),
      path.join('components', 'features', 'home', 'SeeItInActionSafe.tsx'),
      path.join(
        'components',
        'features',
        'home',
        'HomeAdaptiveProfileStory.tsx'
      ),
      path.join('components', 'features', 'home', 'HomePageNarrative.tsx'),
      path.join(
        'components',
        'marketing',
        'homepage-v2',
        'HomepageV2Route.tsx'
      ),
      path.join(
        'components',
        'features',
        'dashboard',
        'organisms',
        'release-provider-matrix',
        'ReleaseProviderMatrix.tsx'
      ),
      path.join('app', 'api', 'chat', 'route.ts'),
      path.join('app', 'api', 'chat', 'album-art', 'shared.ts'),
      path.join('lib', 'feature-flags', 'client.tsx'),
      path.join('lib', 'feature-flags', 'server.ts'),
      path.join('lib', 'feature-flags', 'shared.ts'),
    ]);

    const violations = sourceFiles
      .filter(sourceFile => {
        const relativePath = path.relative(WEB_ROOT, sourceFile);
        if (allowedFiles.has(relativePath)) {
          return false;
        }

        const source = readFileSync(sourceFile, 'utf8');
        return legacyImportRegex.test(source);
      })
      .map(sourceFile => path.relative(WEB_ROOT, sourceFile))
      .sort();

    expect(violations).toEqual([]);
  });

  it('keeps experimental route modules out of production source', () => {
    const sourceFiles = collectSourceFiles(WEB_ROOT);
    const violations = sourceFiles
      .filter(
        sourceFile =>
          !sourceFile.includes(`${path.sep}app${path.sep}exp${path.sep}`)
      )
      .filter(sourceFile => {
        const source = readFileSync(sourceFile, 'utf8');
        return EXP_ROUTE_IMPORT_REGEX.test(source);
      })
      .map(sourceFile => path.relative(WEB_ROOT, sourceFile))
      .sort();

    expect(violations).toEqual([]);
  });
});
