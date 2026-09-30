import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

// The theme defines both --text-base (16px) and --color-base, so Tailwind
// v4 compiles `text-base` to `color: var(--color-base)`, not a size. Since
// #18100 every `text-base` title rendered at the h2 base size in the page
// background colour. Use `text-lg` (16px on the consolidated scale) in the
// web app, `text-(length:--text-base)` in packages/ui, or
// `text-(--color-bg-base)` when you mean the colour.
const AMBIGUOUS = /(?<![-\w[])text-base(?![-\w/])/;
const repo = resolve(__dirname, '../../../../..');
const roots = [
  'apps/web/app',
  'apps/web/components',
  'apps/web/lib',
  'apps/web/styles',
  'apps/web/hooks',
  'apps/web/contexts',
  'packages/ui/atoms',
  'packages/ui/lib',
];

// Ratchet: these files still use text-base and carry unrelated lint debt
// (primitive restyles, label casing) that touching them would surface.
// Remove an entry as soon as its file is migrated; the list only shrinks.
const BASELINE = new Set([
  'apps/web/app/(marketing)/card/JovieCardLanding.tsx',
  'apps/web/app/(marketing)/developers/page.tsx',
  'apps/web/app/app/(shell)/admin/features/FlagChangeConfirmDialog.tsx',
  'apps/web/app/sentry-example-page/page.tsx',
  'apps/web/components/features/admin/BulkDeleteCreatorDialog.tsx',
  'apps/web/components/features/admin/DeleteCreatorDialog.tsx',
  'apps/web/components/features/home/NewFeaturesSection.tsx',
  'apps/web/components/features/home/ProfileMockup.tsx',
  'apps/web/components/features/home/RecentlyShippedSection.tsx',
  'apps/web/components/organisms/profile-notifications-menu/ProfileNotificationsMenu.tsx',
]);

function sourceFiles(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) {
      if (name !== 'node_modules') sourceFiles(path, out);
    } else if (/\.(tsx?|css)$/.test(name) && !/\.test\./.test(name)) {
      out.push(path);
    }
  }
  return out;
}

describe('ambiguous text-base', () => {
  it('is never used as a class outside the shrinking baseline', () => {
    const users = roots
      .flatMap(root => sourceFiles(join(repo, root)))
      .filter(file => AMBIGUOUS.test(readFileSync(file, 'utf8')))
      .map(file => relative(repo, file));
    expect(users.filter(file => !BASELINE.has(file))).toEqual([]);
    // A migrated file must leave the baseline so it cannot regress.
    expect([...BASELINE].filter(file => !users.includes(file))).toEqual([]);
  });

  it('still catches the class and ignores the CSS variable', () => {
    expect(AMBIGUOUS.test("className='text-base font-medium'")).toBe(true);
    expect(AMBIGUOUS.test("'sm:text-base'")).toBe(true);
    expect(AMBIGUOUS.test('font-size: var(--text-base);')).toBe(false);
    expect(AMBIGUOUS.test('text-(length:--text-base)')).toBe(false);
  });
});
