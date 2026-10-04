import { afterEach, describe, expect, it } from 'vitest';
import { MCP_REDIRECT_CLIENT_FAMILIES } from '@/lib/oauth/mcp-redirect-allowlist';
import { getOvieOAuthIssuer, isAllowedRedirect } from './oauth';

const REDIRECTS = [
  'https://chatgpt.com/connector/oauth/callback',
  'https://claude.ai/api/mcp/auth_callback',
  'https://www.cursor.com/agents/mcp/oauth/callback',
  'cursor://anysphere.cursor-mcp/oauth/callback',
  'https://vscode.dev/redirect',
  'http://127.0.0.1:33418/',
  'http://[::1]:3118/callback',
] as const;

describe('Ovie OAuth dynamic client registration', () => {
  it('keeps ChatGPT, Claude, Cursor, VS Code, and loopback callbacks', () => {
    const client = getOvieOAuthIssuer('test-secret').registerClient({
      redirect_uris: [...REDIRECTS],
    });
    expect(client.redirect_uris).toEqual([...REDIRECTS]);
    expect(isAllowedRedirect(REDIRECTS[0])).toBe(true);
  });

  it('names the rejected redirect instead of dropping it', () => {
    expect(() =>
      getOvieOAuthIssuer('test-secret').registerClient({
        redirect_uris: [
          'https://chatgpt.com/callback',
          'https://evilcursor.com/cb',
        ],
      })
    ).toThrow(
      `redirect_uri "https://evilcursor.com/cb" is not allowed. Allowed clients: ${MCP_REDIRECT_CLIENT_FAMILIES}.`
    );
  });
});

describe('Ovie OAuth discovery advertisement', () => {
  const origin = 'https://jov.ie';

  afterEach(() => {
    delete process.env.FEATURE_OVIE_MCP_DYNAMIC_CLIENT_REGISTRATION;
  });

  it('advertises registration_endpoint from the issuer origin while the Better Auth flag is off', () => {
    const metadata = getOvieOAuthIssuer('test-secret').metadata(origin);
    expect(metadata.registration_endpoint).toBe(
      `${origin}/api/ovie/oauth/register`
    );
    expect(metadata.authorization_endpoint).toBe(
      `${origin}/api/ovie/oauth/authorize`
    );
    expect(metadata.token_endpoint).toBe(`${origin}/api/ovie/oauth/token`);
  });

  it('keeps the same registration_endpoint when the Better Auth flag is on', () => {
    process.env.FEATURE_OVIE_MCP_DYNAMIC_CLIENT_REGISTRATION = 'true';
    const metadata = getOvieOAuthIssuer('test-secret').metadata(origin);
    expect(metadata.registration_endpoint).toBe(
      `${origin}/api/ovie/oauth/register`
    );
  });
});
