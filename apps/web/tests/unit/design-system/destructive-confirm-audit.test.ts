import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const WEB_ROOT = join(process.cwd());
const MANIFEST_PATH = join(
  __dirname,
  'destructive-alert-dialog-remaining.json'
);

interface DestructiveAlertDialogManifest {
  readonly maxRemaining: number;
  readonly remaining: readonly string[];
}

const REQUIRED_CONFIRM_DIALOG_SURFACES: readonly {
  readonly label: string;
  readonly file: string;
}[] = [
  {
    label: 'delete release',
    file: 'components/features/dashboard/organisms/release-provider-matrix/ReleaseProviderMatrix.tsx',
  },
  {
    label: 'remove contact',
    file: 'components/features/dashboard/organisms/ContactsManager.tsx',
  },
  {
    label: 'disconnect platform',
    file: 'components/features/dashboard/organisms/settings-artist-profile-section/ConnectedDspList.tsx',
  },
  {
    label: 'delete account',
    file: 'components/features/dashboard/organisms/DataPrivacySection.tsx',
  },
  {
    label: 'cancel subscription',
    file: 'components/organisms/billing/BillingActionsSection.tsx',
  },
  {
    label: 'disconnect touring integration',
    file: 'components/features/dashboard/organisms/SettingsTouringSection.tsx',
  },
];

const SOURCE_EXT = /\.(tsx|ts)$/;
const ALERT_DIALOG_IMPORT =
  /import\s*\{[^}]*\bAlertDialog\b[^}]*\}\s*from\s*['"]@jovie\/ui['"]/;

function readManifest(): DestructiveAlertDialogManifest {
  return JSON.parse(
    readFileSync(MANIFEST_PATH, 'utf8')
  ) as DestructiveAlertDialogManifest;
}

function walk(dir: string, out: string[]): void {
  if (!existsSync(dir)) return;
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const s = statSync(full);
    if (s.isDirectory()) {
      if (entry === 'node_modules' || entry === '.next') continue;
      walk(full, out);
    } else if (SOURCE_EXT.test(entry)) {
      out.push(full);
    }
  }
}

function relativeWebPath(file: string): string {
  return file.replace(`${WEB_ROOT}/`, '');
}

describe('destructive confirm audit', () => {
  it('requires ConfirmDialog on canonical destructive surfaces', () => {
    for (const surface of REQUIRED_CONFIRM_DIALOG_SURFACES) {
      const fullPath = join(WEB_ROOT, surface.file);
      expect(existsSync(fullPath), `${surface.label} file missing`).toBe(true);
      const source = readFileSync(fullPath, 'utf8');
      expect(
        source.includes('ConfirmDialog'),
        `${surface.label} must use ConfirmDialog (${surface.file})`
      ).toBe(true);
    }
  });

  it('keeps raw AlertDialog usage shrink-only outside ConfirmDialog', () => {
    const manifest = readManifest();
    const files: string[] = [];
    walk(join(WEB_ROOT, 'app'), files);
    walk(join(WEB_ROOT, 'components'), files);

    const offenders = files
      .filter(file => !file.includes('/tests/'))
      .filter(file => !file.endsWith('.stories.tsx'))
      .filter(file => !file.endsWith('ConfirmDialog.tsx'))
      .filter(file => ALERT_DIALOG_IMPORT.test(readFileSync(file, 'utf8')))
      .map(relativeWebPath)
      .sort();

    expect(
      offenders,
      `Unexpected raw AlertDialog imports. Migrate to ConfirmDialog or update destructive-alert-dialog-remaining.json:\n${offenders.join('\n')}`
    ).toEqual([...manifest.remaining].sort());

    expect(
      offenders.length,
      `destructive-alert-dialog-remaining.json lists ${offenders.length} files; maxRemaining is ${manifest.maxRemaining}.`
    ).toBeLessThanOrEqual(manifest.maxRemaining);
  });
});
