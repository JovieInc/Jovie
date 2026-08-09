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
      "sourceSha: '61690d2a4af920183f4a85366799ff0bafe4540b'"
    );
    expect(story).not.toContain('fundraisingRegistry:');
  });
});
