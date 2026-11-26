import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const WEB_ROOT = join(
  dirname(fileURLToPath(import.meta.url)),
  '..',
  '..',
  '..'
);

function source(relativePath: string): string {
  return readFileSync(join(WEB_ROOT, relativePath), 'utf8');
}

// Desktop toolbar, header and drawer controls share one visible height:
// 28px (--app-shell-control-height-sm), with the 44px pseudo hit target on
// mobile. These files each carried their own 32px contract before JOV-12567.
const CONTROL_SOURCES = [
  'components/features/dashboard/tasks/TaskWorkspaceHeaderBar.tsx',
  'components/features/dashboard/tasks/TasksPageClient.tsx',
  'components/features/dashboard/tasks/TaskBoard.tsx',
  'components/molecules/tab-bar/TabBar.tsx',
  'components/molecules/drawer/DrawerButton.tsx',
  'app/app/(shell)/library/LibrarySurface.tsx',
  'components/features/presence/PresenceStatusParts.tsx',
  'components/features/dashboard/organisms/tour-dates/TourDatesTable.tsx',
  'components/molecules/drawer/DrawerEditableTextField.tsx',
] as const;

const RETIRED_32PX_PATTERNS = [
  "'h-8 px-2.5'",
  'h-8 w-8 px-0',
  'relative h-8 gap-1.5',
  "'h-8 gap-1",
  "'h-8 max-w-lg",
  "'h-8 w-full",
  "'h-8 rounded-lg",
  'inline-flex h-8 min-w-0',
  'inline-flex h-8 w-8 shrink-0',
  'sm:before:h-8',
  'lg:before:h-8',
  'min-h-8 sm:before:min-h-8',
  "sm: 'h-8 ",
  "icon: 'h-8 ",
] as const;

describe('desktop control height contract', () => {
  it('keeps the shared small control token at 28px', () => {
    expect(source('styles/design-system.css')).toContain(
      '--app-shell-control-height-sm: 28px'
    );
  });

  it.each(CONTROL_SOURCES)(
    '%s has no retired 32px control contract',
    relativePath => {
      const text = source(relativePath);
      for (const pattern of RETIRED_32PX_PATTERNS) {
        expect(text, `${relativePath} contains ${pattern}`).not.toContain(
          pattern
        );
      }
    }
  );

  it('gives drawer title bars the page header height', () => {
    expect(
      source('components/molecules/drawer/EntitySidebarShell.tsx')
    ).toContain("'min-h-(--app-shell-header-height)'");
  });
});
