import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { InvestorBrief } from './InvestorBrief';
import storyMeta, {
  Web188AnonymousFallback,
} from './InvestorPortalLanding.stories';

describe('web-188 investor portal source contract', () => {
  it('binds the server route to the shared embedded InvestorBrief', () => {
    const route = readFileSync(
      resolve(process.cwd(), 'app/investor-portal/page.tsx'),
      'utf8'
    );

    expect(route).toContain(
      "import { InvestorBrief } from '@/components/features/pitch/InvestorBrief'"
    );
    expect(route).toContain('let investorName: string | null = null');
    expect(route).toContain(
      '<InvestorBrief embedded investorName={investorName} />'
    );
    expect(route).toContain('cookies()');
    expect(route).toContain('investorLinks.token');
  });

  it('uses only the shipped null-name fallback in Storybook', () => {
    const story = readFileSync(
      resolve(
        process.cwd(),
        'components/features/pitch/InvestorPortalLanding.stories.tsx'
      ),
      'utf8'
    );

    expect(storyMeta.component).toBe(InvestorBrief);
    expect(storyMeta.args).toEqual({
      embedded: true,
      investorName: null,
    });
    expect(Web188AnonymousFallback.args).toBeUndefined();
    expect(story).toContain("registryId: 'web-188-investor-portal'");
    expect(story).toContain("route: '/investor-portal'");
    expect(story).toContain("fixture: 'shipped null investorName fallback'");
    expect(story).not.toContain('__investor_token');
    expect(story).not.toContain('investorName: {');
  });
});
