import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { GET as getLlmsTxt } from '@/app/llms.txt/route';
import {
  containsFalseWriteApiClaim,
  containsInternalSurfaceLeak,
  extractStaticDeveloperSurfaces,
  findHtmlMarkdownAvailabilityDisagreement,
  STATIC_DEVELOPER_SURFACE_PATHS,
} from '@/lib/agent/developer-discovery-policy';

const webRoot = process.cwd();

function readWebSource(relativePath: string): string {
  return readFileSync(resolve(webRoot, relativePath), 'utf8');
}

const developersPageSource = readWebSource(
  'app/(marketing)/developers/page.tsx'
);
const llmsBody = await getLlmsTxt().text();

/** The resource-link hrefs the /developers page actually renders. */
const developerPageHrefs = [
  ...developersPageSource.matchAll(/href:\s*'(\/[^']*)'/gu),
].map(match => match[1] ?? '');

// The page renders some links through APP_ROUTES constants; resolve the ones
// this policy covers from the canonical route table.
const APP_ROUTES_OVERRIDES: Record<string, string> = {
  CLI: '/cli',
  API_VERSIONING: '/api-versioning',
  DEVELOPERS: '/developers',
};
const routeConstantHrefs = [
  ...developersPageSource.matchAll(/href=\{APP_ROUTES\.(\w+)\}/gu),
]
  .map(match => APP_ROUTES_OVERRIDES[match[1] ?? ''] ?? '')
  .filter(Boolean);

describe('developer discovery policy (JOV-6265)', () => {
  describe('deliberate-red fixtures: generic artist-only machine identity', () => {
    // The artist-only fixture class itself is enforced by
    // lib/marketing/company-identity-policy (JOV-6261) — this suite pins the
    // machine-identity half: llms.txt guidance stays a general company
    // definition while specialist artist API semantics stay intact.
    it('flags an artist-only machine identity body', async () => {
      const { isArtistOnlyCompanyDefinition } = await import(
        '@/lib/marketing/company-identity-policy'
      );
      expect(
        isArtistOnlyCompanyDefinition(
          'Jovie is a release platform for independent musicians.'
        )
      ).toBe(true);
      expect(isArtistOnlyCompanyDefinition(llmsBody)).toBe(false);
    });

    it('keeps specialist artist-scoped API description green', async () => {
      const { isArtistOnlyCompanyDefinition } = await import(
        '@/lib/marketing/company-identity-policy'
      );
      expect(
        isArtistOnlyCompanyDefinition(
          'The public artist API is read-only. GET /api/v1/{username} returns profile, releases, events, merch.'
        )
      ).toBe(false);
    });
  });

  describe('deliberate-red fixtures: HTML/Markdown availability disagreement', () => {
    it('flags a developers page that omits a machine-advertised surface', () => {
      // Red: llms.txt advertises /cli and /api-versioning; a page whose
      // resource links omit them disagrees with the machine guidance.
      const redPageHrefs = [
        ...developerPageHrefs,
        ...routeConstantHrefs,
      ].filter(href => href !== '/cli' && href !== '/api-versioning');
      expect(
        findHtmlMarkdownAvailabilityDisagreement(redPageHrefs, llmsBody)
      ).toEqual(
        expect.arrayContaining([
          'developers page omits /cli',
          'developers page omits /api-versioning',
        ])
      );
    });

    it('flags machine guidance that omits a page-advertised surface', () => {
      const redLlmsBody = llmsBody.replaceAll('/api-versioning', '/policy-x');
      expect(
        findHtmlMarkdownAvailabilityDisagreement(
          [...developerPageHrefs, ...routeConstantHrefs],
          redLlmsBody
        )
      ).toContain('machine guidance omits /api-versioning');
    });

    it('passes when the developers page and machine guidance agree', () => {
      // Green: every machine-advertised static developer surface has a
      // matching resource link on the /developers page.
      expect(
        findHtmlMarkdownAvailabilityDisagreement(
          [...developerPageHrefs, ...routeConstantHrefs],
          llmsBody
        )
      ).toEqual([]);
    });
  });

  describe('deliberate-red fixtures: false write-API claim', () => {
    it('flags a write method on the public artist API', () => {
      expect(
        containsFalseWriteApiClaim(
          'POST https://jov.ie/api/v1/{username} creates a new release.'
        )
      ).toBe(true);
    });

    it('flags a write-capability sentence about the public artist API', () => {
      expect(
        containsFalseWriteApiClaim(
          'The public artist API supports writes to artist profiles.'
        )
      ).toBe(true);
      expect(
        containsFalseWriteApiClaim(
          'Update merch via the public artist API with a PUT request.'
        )
      ).toBe(true);
    });

    it('keeps the honest read-only boundary description green', () => {
      expect(
        containsFalseWriteApiClaim(
          'General public writes or OAuth — the public artist API and anonymous MCP tools are read-only; owner-only MCP tools require authenticated profile ownership and explicit confirmation for writes'
        )
      ).toBe(false);
      expect(containsFalseWriteApiClaim(llmsBody)).toBe(false);
    });

    it('keeps the GET quickstart green', () => {
      expect(
        containsFalseWriteApiClaim(
          'Fetch one public artist with GET https://jov.ie/api/v1/{username}.'
        )
      ).toBe(false);
    });
  });

  describe('deliberate-red fixtures: internal surface leaking through llms/cache', () => {
    it('flags an internal agent name in machine guidance', () => {
      expect(
        containsInternalSurfaceLeak(
          'Use the Summer orchestrator to manage release workflows.'
        )
      ).toBe(true);
      expect(containsInternalSurfaceLeak('Eve triages your backlog.')).toBe(
        true
      );
    });

    it('flags an internal-only route presented as public', () => {
      expect(
        containsInternalSurfaceLeak('Operator HUD: https://jov.ie/hud')
      ).toBe(true);
      expect(
        containsInternalSurfaceLeak(
          'Founder tools: https://jov.ie/investor-portal'
        )
      ).toBe(true);
    });

    it('keeps the live llms.txt and developers page leak-free', () => {
      expect(containsInternalSurfaceLeak(llmsBody)).toBe(false);
      expect(containsInternalSurfaceLeak(developersPageSource)).toBe(false);
    });
  });

  describe('static developer surface inventory', () => {
    it('extracts every advertised static surface from machine guidance', () => {
      const surfaces = extractStaticDeveloperSurfaces(llmsBody);
      for (const path of STATIC_DEVELOPER_SURFACE_PATHS) {
        expect(surfaces).toContain(path);
      }
    });

    it('does not treat a dynamic template or external doc as a static surface', () => {
      const surfaces = extractStaticDeveloperSurfaces(
        'See https://jov.ie/api/v1/{username} and https://docs.jov.ie.'
      );
      expect(surfaces).toEqual([]);
    });
  });
});
