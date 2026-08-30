import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const WEB_ROOT = join(process.cwd());

function read(relativePath: string) {
  return readFileSync(join(WEB_ROOT, relativePath), 'utf8');
}

describe('web-195 pitch source contract', () => {
  it('keeps the route on the shared InvestorBrief body', () => {
    const route = read('app/pitch/page.tsx');

    expect(route).toContain(
      "import { InvestorBrief } from '@/components/features/pitch/InvestorBrief'"
    );
    expect(route).toContain('return <InvestorBrief />');
    expect(route).toContain('robots: NOINDEX_ROBOTS');
  });

  it('keeps the shipped body bound to checked-in registry evidence', () => {
    const component = read('components/features/pitch/InvestorBrief.tsx');

    expect(component).toContain('const registry = fundraisingRegistry');
    expect(component).toContain('registry.coreSlides.map');
    expect(component).toContain('registry.operatingLoop.map');
    expect(component).toContain('registry.risks.map');
    expect(component).toContain('data-pitch-demo-video');
  });

  it('keeps exactly one primary-variant CTA on the screen', () => {
    const component = read('components/features/pitch/InvestorBrief.tsx');
    const primaries =
      component.match(/<Button\b[^>]*variant='primary'[^>]*>/g) ?? [];

    expect(primaries).toHaveLength(1);
    expect(primaries[0]).toContain("size='md'");
  });

  it('registers one deterministic story for the exact production component', () => {
    const story = read('components/features/pitch/InvestorBrief.stories.tsx');

    expect(story).toContain('component: InvestorBrief');
    expect(story).toContain("registryId: 'web-195-pitch'");
    expect(story).toContain("route: '/pitch'");
    expect(story).toContain(
      "source: 'apps/web/components/features/pitch/InvestorBrief.tsx'"
    );
    expect(story).toContain("sourceExport: 'InvestorBrief'");
    expect(story).toContain("storyExport: 'Web195Pitch'");
    expect(story).toContain(
      "sourceSha: '8b0353fcbeb0cffef614fa47afbbbd8eeae48997'"
    );
    expect(story).not.toContain('fundraisingRegistry:');
  });
});
