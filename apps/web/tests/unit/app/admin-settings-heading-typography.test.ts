import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

function findSourceFile(...candidates: string[]): string {
  const found = candidates.find(candidate => existsSync(candidate));
  if (!found) {
    throw new Error(
      `Could not find source file. Checked: ${candidates.join(', ')}`
    );
  }
  return found;
}

const ADMIN_SETTINGS_FILES = [
  findSourceFile(
    resolve(process.cwd(), 'app/app/(shell)/settings/admin/page.tsx'),
    resolve(process.cwd(), 'apps/web/app/app/(shell)/settings/admin/page.tsx')
  ),
  findSourceFile(
    resolve(
      process.cwd(),
      'components/features/dashboard/organisms/SettingsAdminSection.tsx'
    ),
    resolve(
      process.cwd(),
      'apps/web/components/features/dashboard/organisms/SettingsAdminSection.tsx'
    )
  ),
  findSourceFile(
    resolve(
      process.cwd(),
      'components/features/admin/WaitlistSettingsPanel.tsx'
    ),
    resolve(
      process.cwd(),
      'apps/web/components/features/admin/WaitlistSettingsPanel.tsx'
    )
  ),
  findSourceFile(
    resolve(
      process.cwd(),
      'components/features/admin/campaigns/CampaignSettingsPanel.tsx'
    ),
    resolve(
      process.cwd(),
      'apps/web/components/features/admin/campaigns/CampaignSettingsPanel.tsx'
    )
  ),
  findSourceFile(
    resolve(process.cwd(), 'app/app/(shell)/admin/investors/settings/page.tsx'),
    resolve(
      process.cwd(),
      'apps/web/app/app/(shell)/admin/investors/settings/page.tsx'
    )
  ),
  findSourceFile(
    resolve(
      process.cwd(),
      'app/app/(shell)/admin/investors/settings/InvestorSettingsForm.tsx'
    ),
    resolve(
      process.cwd(),
      'apps/web/app/app/(shell)/admin/investors/settings/InvestorSettingsForm.tsx'
    )
  ),
  findSourceFile(
    resolve(process.cwd(), 'components/molecules/settings/SettingsPanel.tsx'),
    resolve(
      process.cwd(),
      'apps/web/components/molecules/settings/SettingsPanel.tsx'
    )
  ),
  findSourceFile(
    resolve(
      process.cwd(),
      'components/molecules/settings/SettingsToggleRow.tsx'
    ),
    resolve(
      process.cwd(),
      'apps/web/components/molecules/settings/SettingsToggleRow.tsx'
    )
  ),
  findSourceFile(
    resolve(
      process.cwd(),
      'components/molecules/settings/SettingsActionRow.tsx'
    ),
    resolve(
      process.cwd(),
      'apps/web/components/molecules/settings/SettingsActionRow.tsx'
    )
  ),
] as const;

const COMBINED_SOURCE = ADMIN_SETTINGS_FILES.map(filePath =>
  readFileSync(filePath, 'utf8')
).join('\n');

describe('admin settings heading typography', () => {
  it('does not use all-caps tracking eyebrow styling on headings', () => {
    expect(COMBINED_SOURCE).not.toMatch(/uppercase\s+tracking-/);
    expect(COMBINED_SOURCE).not.toMatch(/tracking-\[[0-9.]+em\]/);
    expect(COMBINED_SOURCE).not.toMatch(/tracking-wide/);
    expect(COMBINED_SOURCE).not.toContain('uppercase');
  });

  it('does not use oversized heading sizes in admin settings surfaces', () => {
    expect(COMBINED_SOURCE).not.toMatch(/\btext-(lg|xl|2xl|3xl)\b/);
    expect(COMBINED_SOURCE).not.toMatch(/text-\[(1[4-9]|2[0-9]|3[0-9])px\]/);
  });

  it('keeps settings panel and row headings on the quiet app scale', () => {
    expect(COMBINED_SOURCE).toContain('text-app font-[540]');
    expect(COMBINED_SOURCE).not.toMatch(
      /(?:SettingsPanel|SettingsToggleRow|SettingsActionRow|SettingRow)[\s\S]{0,400}font-semibold/
    );
  });

  it('keeps admin settings surfaces on shared settings primitives', () => {
    const adminSection = readFileSync(
      findSourceFile(
        resolve(
          process.cwd(),
          'components/features/dashboard/organisms/SettingsAdminSection.tsx'
        ),
        resolve(
          process.cwd(),
          'apps/web/components/features/dashboard/organisms/SettingsAdminSection.tsx'
        )
      ),
      'utf8'
    );

    expect(adminSection).toContain('import { SettingsPanel }');
    expect(adminSection).toContain('<SettingsPanel');
    expect(adminSection).toContain('WaitlistSettingsPanel');
    expect(adminSection).toContain('CampaignSettingsPanel');
  });
});
