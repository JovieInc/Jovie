#!/usr/bin/env tsx
/**
 * Mint a founder refresh+access pair for a registered MCP client_id (local only).
 *
 *   BETTER_AUTH_SECRET=... pnpm tsx apps/web/scripts/ovie/mint-mcp-oauth-tokens.ts \
 *     --redirect-uri 'https://www.cursor.com/agents/mcp/oauth/callback'
 *
 * Prints JSON with access_token, refresh_token, client_id, and expires_in values.
 * Store refresh_token in Cursor Project MCP OAuth config; the client refreshes hourly.
 */
import { parseArgs } from 'node:util';
import {
  getOvieOAuthIssuer,
  ovieIssuerSecret,
} from '@/lib/ovie/mcp/oauth';

const { values } = parseArgs({
  options: {
    'redirect-uri': { type: 'string', multiple: true },
    'client-id': { type: 'string' },
    subject: { type: 'string', default: 'ovie-cloud-agent' },
    email: { type: 'string' },
  },
});

const redirectUris = values['redirect-uri'];
if (!redirectUris?.length && !values['client-id']) {
  console.error(
    'Pass --redirect-uri (repeatable) or an existing --client-id from registration.'
  );
  process.exit(1);
}

const issuer = getOvieOAuthIssuer(ovieIssuerSecret());
const clientId =
  values['client-id'] ??
  issuer.registerClient({ redirect_uris: redirectUris }).client_id;

const issued = issuer.mintFounderRefreshGrant({
  clientId,
  subject: values.subject,
  email: values.email,
});

console.log(
  JSON.stringify(
    {
      client_id: clientId,
      ...issued,
      note: 'Use OAuth connector URL https://jov.ie/api/ovie/mcp — not a raw bearer env.',
    },
    null,
    2
  )
);