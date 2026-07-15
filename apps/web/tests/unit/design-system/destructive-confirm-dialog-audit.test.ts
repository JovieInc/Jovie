import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

const WEB_ROOT = process.cwd().endsWith('/apps/web')
  ? process.cwd()
  : join(process.cwd(), 'apps', 'web');
const SCAN_DIRS = [join(WEB_ROOT, 'components'), join(WEB_ROOT, 'app', 'app')];
const SOURCE_EXT = /\.(tsx|ts)$/;

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

function findDirectDestructiveAlertDialogActions(): string[] {
  const files: string[] = [];
  for (const dir of SCAN_DIRS) walk(dir, files);

  return files.flatMap(file => {
    const source = readFileSync(file, 'utf8');
    const destructiveActionTag =
      /<AlertDialogAction\b[^>]*variant=(?:'|")destructive(?:'|")[^>]*>/;
    if (!destructiveActionTag.test(source)) return [];

    const repoRelative = relative(WEB_ROOT, file);
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
  });
});
