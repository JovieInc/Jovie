import { describe, expect, it } from 'vitest';
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
