import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { VISUAL_QA_VIEWPORTS } from '@/lib/visual-qa/viewports';

function readWebSource(path: string): string {
  return readFileSync(resolve(process.cwd(), path), 'utf8');
}

describe('CLI marketing review gallery', () => {
  it('registers /cli with desktop and mobile evidence viewports', () => {
    const story = readWebSource(
      'components/marketing/storybook/CliLanding.stories.tsx'
    );

    expect(story).toContain("title: 'Marketing/Routes/cli'");
    expect(story).toContain('recipeViewports');
    expect(story).toContain("name: 'desktop'");
    expect(story).toContain("name: 'mobile'");
    expect(story).toContain('CliLandingPage');
    expect(story).toContain('PublicPageShell');
    expect(story).toContain(
      `viewports: [${VISUAL_QA_VIEWPORTS.desktop.width}]`
    );
    expect(story).toContain(`viewports: [${VISUAL_QA_VIEWPORTS.mobile.width}]`);
    expect(story).toContain(
      `${VISUAL_QA_VIEWPORTS.desktop.width}×${VISUAL_QA_VIEWPORTS.desktop.height}`
    );
    expect(story).toContain(
      `${VISUAL_QA_VIEWPORTS.mobile.width}×${VISUAL_QA_VIEWPORTS.mobile.height}`
    );
  });
});
