import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { libraryApprovalStatusClasses } from '@/lib/library/approval-status';
import {
  releaseStatusClasses,
  releaseStatusDotClasses,
} from '@/lib/library/release-status';

// Regression guards for #12317 (Library/right-rail System B compliance):
// distinct badge accents, pill / hover-circle buttons, provider icons.

function textToken(classes: string): string {
  return classes.split(/\s+/).find(token => token.startsWith('text-')) ?? '';
}

const repoRoot = process.cwd();
const readSource = (path: string) => readFileSync(join(repoRoot, path), 'utf8');

describe('library badge accents (no two semantic badges share one color)', () => {
  it('gives released and scheduled distinct accents', () => {
    expect(releaseStatusClasses('released')).toContain('text-accent');
    expect(releaseStatusClasses('scheduled')).toContain('text-info');
    expect(textToken(releaseStatusClasses('released'))).not.toBe(
      textToken(releaseStatusClasses('scheduled'))
    );
  });

  it('does not reuse approval "approved" accent for "released" accent', () => {
    // #12317: approved uses accent-purple, released uses accent — must differ.
    const approved = textToken(libraryApprovalStatusClasses('approved'));
    const released = textToken(releaseStatusClasses('released'));
    expect(approved).toBe('text-accent-purple');
    expect(released).toBe('text-accent');
    expect(released).not.toBe(approved);
  });

  it('keeps the status dot aligned with the badge accent', () => {
    expect(releaseStatusDotClasses('released')).toBe('bg-accent');
    expect(releaseStatusDotClasses('scheduled')).toBe('bg-info');
  });
});

describe('library right-rail System B structural compliance', () => {
  const surface = readSource('app/app/(shell)/library/LibrarySurface.tsx');
  const css = readSource('styles/design-system.css');

  it('renders provider rows (drawer + rail filter) with brand provider icons', () => {
    // Both the drawer Providers list and the rail Providers filter rows.
    expect(surface.match(/<ProviderIcon/g)?.length ?? 0).toBeGreaterThanOrEqual(
      2
    );
    // No generic Music2 standing in for a specific provider.
    expect(surface).not.toContain('icon={Music2}');
    expect(surface).not.toMatch(
      /<Music2 className='h-3\.5 w-3\.5 text-tertiary-token' \/>\s*\n\s*<span className='min-w-0 flex-1 truncate'>/
    );
  });

  it('keeps remaining library action buttons pill-shaped and retires old icon button CSS', () => {
    expect(css).toMatch(
      /:where\(\.system-b-library-action\)\s*\{\s*border-radius: var\(--radius-full\);/
    );
    expect(css).not.toContain('system-b-library-icon-button');
  });

  it('edits approval status inline in Details without a native select', () => {
    expect(surface).toContain("label='Approval Status'");
    expect(surface).toContain('ApprovalStatusEditor');
    expect(surface).not.toMatch(/<DrawerSection[^>]*title='Approval'/);
    expect(surface).not.toMatch(/<select[^>]*library-approval-status-select/);
    expect(surface).toContain('TOOLBAR_MENU_CONTENT_CLASS');
  });

  it('surfaces Release Status on cards/hero and Approval Status once in Details (JOV-3333)', () => {
    // Grid card badge must use release status classes, not approval.
    expect(surface).toContain('library-release-status-');
    expect(surface).toContain('Release Status: ${formatLibraryStatus');
    // Drawer hero must not render a second approval pill next to release.
    // Approval lives only in ApprovalStatusEditor under Details.
    expect(surface).toContain('ApprovalStatusEditor');
    // Card status data-testid is release, not approval.
    expect(surface).toContain('library-release-status-${asset.id}');
  });
});
