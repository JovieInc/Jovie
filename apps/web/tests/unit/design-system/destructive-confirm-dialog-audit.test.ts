import { spawnSync } from 'node:child_process';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { isAbsolute, join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

const WEB_ROOT = process.cwd().endsWith('/apps/web')
  ? process.cwd()
  : join(process.cwd(), 'apps', 'web');
const SCAN_DIRS = ['components', 'app/app'] as const;
const SOURCE_EXT = /\.(tsx|ts)$/;
const TRUSTED_RIPGREP_PATHS = [
  '/usr/bin/rg',
  '/usr/local/bin/rg',
  '/opt/homebrew/bin/rg',
] as const;

interface RipgrepResult {
  readonly status: number | null;
  readonly stdout: string;
  readonly error?: Error;
}

type RipgrepRunner = (webRoot: string) => RipgrepResult;

const DIRECT_DESTRUCTIVE_ALERT_DIALOG_ALLOWLIST = new Set([
  'components/organisms/profile-notifications-menu/ProfileNotificationsMenu.tsx',
  'components/features/admin/DeleteCreatorDialog.tsx',
  'components/features/admin/BulkDeleteCreatorDialog.tsx',
  'components/features/admin/admin-users-table/AdminUsersTableUnified.tsx',
]);

const REQUIRED_DESTRUCTIVE_FLOWS = [
  {
    name: 'delete release',
    file: 'components/features/dashboard/organisms/release-provider-matrix/ReleaseProviderMatrix.tsx',
  },
  {
    name: 'remove contact',
    file: 'components/features/dashboard/organisms/ContactsManager.tsx',
  },
  {
    name: 'disconnect platform',
    file: 'components/features/dashboard/organisms/settings-artist-profile-section/ConnectedDspList.tsx',
  },
  {
    name: 'disconnect integration',
    file: 'components/features/dashboard/organisms/SettingsTouringSection.tsx',
  },
  {
    name: 'delete account',
    file: 'components/features/dashboard/organisms/DataPrivacySection.tsx',
  },
  {
    name: 'cancel subscription',
    file: 'components/organisms/billing/BillingActionsSection.tsx',
  },
] as const;

function walk(dir: string, out: string[]): void {
  if (!existsSync(dir)) return;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name === '.next') continue;
      walk(full, out);
      continue;
    }
    if (entry.isFile() && SOURCE_EXT.test(entry.name)) out.push(full);
  }
}

function isRegularFile(path: string): boolean {
  try {
    return statSync(path).isFile();
  } catch {
    return false;
  }
}

function runRipgrepCandidates(webRoot: string): RipgrepResult {
  const ripgrepPath = TRUSTED_RIPGREP_PATHS.find(path => existsSync(path));
  if (!ripgrepPath) return { status: null, stdout: '' };

  const result = spawnSync(
    ripgrepPath,
    [
      '--no-config',
      '--files-with-matches',
      '--sort',
      'path',
      '--null',
      '--hidden',
      '--text',
      '--no-messages',
      '--no-ignore',
      '--threads',
      '2',
      '--glob',
      '*.{ts,tsx}',
      '--glob',
      '!**/{node_modules,.next}/**',
      '--fixed-strings',
      '--regexp',
      'AlertDialogAction',
      ...SCAN_DIRS,
    ],
    {
      cwd: webRoot,
      encoding: 'utf8',
      maxBuffer: 5 * 1024 * 1024,
      timeout: 5_000,
    }
  );
  return {
    status: result.status,
    stdout: result.stdout ?? '',
    error: result.error,
  };
}

function findRipgrepCandidates(
  webRoot: string,
  runner: RipgrepRunner
): string[] | null {
  const result = runner(webRoot);
  if (result.error || (result.status !== 0 && result.status !== 1)) return null;
  if (result.status === 1) return [];

  const files = [...new Set((result.stdout ?? '').split('\0').filter(Boolean))];
  if (
    files.length === 0 ||
    files.some(file => {
      const full = join(webRoot, file);
      const rel = relative(webRoot, full).split('\\').join('/');
      return (
        isAbsolute(file) ||
        rel.startsWith('..') ||
        !SCAN_DIRS.some(dir => rel.startsWith(`${dir}/`)) ||
        !SOURCE_EXT.test(rel) ||
        !isRegularFile(full)
      );
    })
  ) {
    return null;
  }
  return files
    .sort((a, b) => a.localeCompare(b))
    .map(file => join(webRoot, file));
}

function findDirectDestructiveAlertDialogActions(
  webRoot = WEB_ROOT,
  runner: RipgrepRunner = runRipgrepCandidates
): string[] {
  const candidates = findRipgrepCandidates(webRoot, runner);
  const files: string[] = candidates ?? [];
  if (candidates === null) {
    for (const dir of SCAN_DIRS) walk(join(webRoot, dir), files);
  }
  files.sort((a, b) => a.localeCompare(b));

  return files.flatMap(file => {
    const source = readFileSync(file, 'utf8');
    const destructiveActionTag =
      /<AlertDialogAction\b[^>]*variant=(?:'|")destructive(?:'|")[^>]*>/;
    if (!destructiveActionTag.test(source)) return [];

    const repoRelative = relative(webRoot, file).split('\\').join('/');
    return DIRECT_DESTRUCTIVE_ALERT_DIALOG_ALLOWLIST.has(repoRelative)
      ? []
      : [repoRelative];
  });
}

describe('destructive action ConfirmDialog audit', () => {
  it('keeps the required destructive flows on the canonical ConfirmDialog', () => {
    const missing = REQUIRED_DESTRUCTIVE_FLOWS.flatMap(({ name, file }) => {
      const source = readFileSync(join(WEB_ROOT, file), 'utf8');
      const destructiveConfirmDialog =
        /<ConfirmDialog\b[\s\S]*?variant=(?:'|"|\{[^}]*['"])destructive(?:'|"|['"][^}]*\})/;
      const usesConfirmDialog = destructiveConfirmDialog.test(source);

      return usesConfirmDialog ? [] : [`${name}: ${file}`];
    });

    expect(
      missing,
      `Destructive flows must use ConfirmDialog with variant='destructive'. Missing:\n${missing.join(
        '\n'
      )}`
    ).toEqual([]);
  });

  it('blocks new raw destructive AlertDialogAction usage outside the allowlist', () => {
    const unconfirmedActions = findDirectDestructiveAlertDialogActions();

    expect(
      unconfirmedActions,
      `Use ConfirmDialog for destructive actions instead of raw AlertDialogAction. New raw usages:\n${unconfirmedActions.join(
        '\n'
      )}`
    ).toEqual([]);
  }, 30_000);

  it('keeps the rg prefilter lossless and falls back on untrusted output', () => {
    const webRoot = mkdtempSync(join(tmpdir(), 'destructive-audit-'));
    const result =
      (status: number | null, stdout = '', error?: Error): RipgrepRunner =>
      () => ({ status, stdout, error });

    try {
      for (const dir of [
        'components',
        'components/node_modules/pkg',
        'components/.next',
        'app/app',
      ]) {
        mkdirSync(join(webRoot, dir), { recursive: true });
      }
      mkdirSync(join(webRoot, 'components/not-a-file.ts'));
      writeFileSync(
        join(webRoot, 'components/unsafe-a.tsx'),
        '\0<AlertDialogAction variant="destructive">A</AlertDialogAction>\n'
      );
      writeFileSync(
        join(webRoot, 'app/app/unsafe-b.ts'),
        '<AlertDialogAction data-x variant="destructive">B</AlertDialogAction>\n'
      );
      writeFileSync(
        join(webRoot, 'components/safe.tsx'),
        '<AlertDialogAction>Safe</AlertDialogAction>\n'
      );
      for (const file of [
        'components/node_modules/pkg/ignored.tsx',
        'components/.next/ignored.tsx',
      ]) {
        writeFileSync(
          join(webRoot, file),
          '<AlertDialogAction variant="destructive">Ignored</AlertDialogAction>\n'
        );
      }

      const expected = ['app/app/unsafe-b.ts', 'components/unsafe-a.tsx'];
      expect(findDirectDestructiveAlertDialogActions(webRoot)).toEqual(
        expected
      );
      expect(
        findDirectDestructiveAlertDialogActions(
          webRoot,
          result(
            0,
            'components/unsafe-a.tsx\0app/app/unsafe-b.ts\0components/unsafe-a.tsx\0'
          )
        )
      ).toEqual(expected);

      for (const runner of [
        result(2),
        result(null, '', new Error('spawnSync rg ETIMEDOUT')),
        result(0),
        result(0, '../outside.tsx\0'),
        result(0, 'components/missing.tsx\0'),
        result(0, 'components/not-a-file.ts\0'),
      ]) {
        expect(
          findDirectDestructiveAlertDialogActions(webRoot, runner)
        ).toEqual(expected);
      }
      expect(
        findDirectDestructiveAlertDialogActions(webRoot, result(1))
      ).toEqual([]);
    } finally {
      rmSync(webRoot, { recursive: true, force: true });
    }
  });
});
