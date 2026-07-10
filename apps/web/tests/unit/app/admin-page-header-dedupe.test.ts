import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * JOV-3527 — AdminPage must not re-render the route title. The shell
 * DashboardHeader breadcrumb is the single visible page-title source.
 *
 * Also locks section-heading scale on the shared admin chrome primitives so
 * oversized `text-2xl`/`text-3xl` / uppercase-tracking drift cannot regress
 * without a deliberate token decision.
 */

const appRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');

function read(rel: string): string {
  return readFileSync(resolve(appRoot, rel), 'utf8');
}

const ADMIN_PAGE = 'components/features/admin/layout/AdminPage.tsx';
const CONTENT_SECTION_HEADER = 'components/molecules/ContentSectionHeader.tsx';
const SETTINGS_PANEL = 'components/molecules/settings/SettingsPanel.tsx';
const OPERATIONAL_CONTROLS =
  'components/features/admin/OperationalControlPanel.tsx';
const OPS_PAGE = 'app/app/(shell)/admin/ops/page.tsx';

describe('admin page header dedupe (JOV-3527)', () => {
  it('does not render the route title via ContentSectionHeader', () => {
    const source = read(ADMIN_PAGE);

    expect(source).not.toContain('ContentSectionHeader');
    expect(source).toContain("data-testid='admin-page-meta'");
    expect(source).toContain('showMetaHeader');
    // Title prop is retained for tabs/aria, not for a visible h2.
    expect(source).toMatch(/readonly title: string/);
    expect(source).toContain('DashboardHeader');
  });

  it('keeps ops inside AdminPage without a second page-title block', () => {
    const source = read(OPS_PAGE);

    expect(source).toContain('<AdminPage');
    expect(source).toContain("title='Ops'");
    // Page must not mount its own ContentSectionHeader page chrome.
    expect(source).not.toMatch(
      /ContentSectionHeader[\s\S]{0,120}title=['"]Ops['"]/
    );
  });

  it('keeps ContentSectionHeader on the quiet app scale', () => {
    const source = read(CONTENT_SECTION_HEADER);

    expect(source).toContain('text-xs font-semibold');
    expect(source).not.toMatch(/\btext-(lg|xl|2xl|3xl)\b/);
    expect(source).not.toMatch(/uppercase/);
  });

  it('keeps SettingsPanel section titles on the quiet app scale', () => {
    const source = read(SETTINGS_PANEL);

    expect(source).toContain('text-app font-[540]');
    expect(source).not.toMatch(/\btext-(lg|xl|2xl|3xl)\b/);
    expect(source).not.toMatch(/uppercase/);
  });

  it('does not introduce oversized section headings on operational controls', () => {
    const source = read(OPERATIONAL_CONTROLS);

    expect(source).not.toMatch(/\btext-(lg|xl|2xl|3xl)\b/);
    expect(source).not.toMatch(/uppercase\s+tracking-/);
    expect(source).toContain('SettingsPanel');
    expect(source).toContain('ContentSectionHeader');
  });
});
