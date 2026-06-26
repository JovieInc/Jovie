import { describe, expect, it } from 'vitest';
import expected from '@/lib/auth/oauth-redirect-uris.expected.json';
import { buildContentSecurityPolicy } from '@/lib/security/content-security-policy';

/**
 * CSP must allow every Clerk FAPI host.
 *
 * Clerk JS loads from and XHRs to `https://<fapi-host>` (script-src + connect-src),
 * and the OAuth handoff frames it (frame-src). If the CSP omits a FAPI host,
 * sign-in silently fails in the browser with a CSP violation — another
 * "silently broken auth" mode. This locks CSP to the same FAPI-host source of
 * truth as the console redirect URIs (oauth-redirect-uris.expected.json), so the
 * two can never drift apart: add a Clerk instance / change a FAPI host and this
 * fails until CSP is updated too.
 */
describe('CSP ↔ Clerk FAPI host sync', () => {
  const csp = buildContentSecurityPolicy({ nonce: 'test-nonce' });
  const directiveOf = (name: string) =>
    csp
      .split(';')
      .map(d => d.trim())
      .find(d => d.startsWith(`${name} `)) ?? '';

  for (const [instance, { fapiHost }] of Object.entries(expected.instances)) {
    const origin = `https://${fapiHost}`;

    it(`connect-src allows the ${instance} FAPI host (${fapiHost})`, () => {
      expect(
        directiveOf('connect-src'),
        `CSP connect-src is missing ${origin} — Clerk XHRs to FAPI will be blocked`
      ).toContain(origin);
    });

    it(`script-src allows the ${instance} FAPI host (${fapiHost})`, () => {
      expect(
        directiveOf('script-src'),
        `CSP script-src is missing ${origin} — Clerk JS load will be blocked`
      ).toContain(origin);
    });
  }
});
