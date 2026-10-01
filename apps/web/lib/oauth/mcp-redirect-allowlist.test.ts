import { describe, expect, it } from 'vitest';
import {
  acceptedMcpRedirectUris,
  isAllowedMcpRedirectUri,
  MCP_REDIRECT_CLIENT_FAMILIES,
} from './mcp-redirect-allowlist';

function accepts(uris: readonly string[]) {
  it.each(uris)('accepts %s', uri => {
    expect(isAllowedMcpRedirectUri(uri)).toBe(true);
  });
}

function rejects(uris: readonly string[]) {
  it.each(uris)('rejects %s', uri => {
    expect(isAllowedMcpRedirectUri(uri)).toBe(false);
  });
}

describe('ChatGPT redirects', () => {
  accepts([
    'https://chatgpt.com/connector/oauth/callback',
    'https://chatgpt.com/callback',
    'https://chat.openai.com/callback',
    'https://connector.chatgpt.com/oauth/callback',
  ]);
  rejects([
    'http://chatgpt.com/callback',
    'https://chatgpt.com.evil.io/callback',
    'https://notchatgpt.com/callback',
    'https://user@chatgpt.com/callback',
    'https://chatgpt.com/callback#fragment',
  ]);
});

describe('Claude redirects', () => {
  accepts([
    'https://claude.ai/api/mcp/auth_callback',
    'http://localhost:3118/callback',
    'http://127.0.0.1:3118/callback',
    'https://127.0.0.1/callback',
  ]);
  rejects([
    'https://claude.ai.evil.io/api/mcp/auth_callback',
    'https://notclaude.ai/api/mcp/auth_callback',
    'https://www.claude.ai/api/mcp/auth_callback',
    'https://claude.ai/api/mcp/other',
    'http://claude.ai/api/mcp/auth_callback',
    'https://claude.ai@evil.io/api/mcp/auth_callback',
  ]);
});

describe('Cursor redirects', () => {
  accepts([
    'https://cursor.com/agents/mcp/oauth/callback',
    'https://www.cursor.com/agents/mcp/oauth/callback',
    'https://WWW.Cursor.com/oauth/callback',
    'cursor://anysphere.cursor-mcp/oauth/callback',
    'http://localhost:8787/callback',
  ]);
  rejects([
    'https://evilcursor.com/agents/mcp/oauth/callback',
    'https://cursor.com.evil.io/agents/mcp/oauth/callback',
    'https://cursor.com@evil.io/agents/mcp/oauth/callback',
    'https://user@www.cursor.com/agents/mcp/oauth/callback',
    'http://cursor.com/agents/mcp/oauth/callback',
    'cursor://evil.example/oauth/callback',
    'cursor://anysphere.cursor-mcp/oauth/other',
    'cursor://anysphere.cursor-mcp/oauth/appname/callback',
    'cursor://anysphere.cursor-mcp/oauth/callback?next=1',
    'cursor://anysphere.cursor-mcp@evil.io/oauth/callback',
    'https://.cursor.com/cb',
    'https://foo..cursor.com/cb',
  ]);
});

describe('VS Code redirects', () => {
  accepts([
    'https://vscode.dev/redirect',
    'https://insiders.vscode.dev/redirect',
    'http://127.0.0.1:33418/',
    'http://127.0.0.1/',
  ]);
  rejects([
    'https://vscode.dev.evil.io/redirect',
    'https://evil.vscode.dev/redirect',
    'http://vscode.dev/redirect',
    'https://vscode.dev/other',
    'vscode://file/redirect',
    'https://vscode.dev@evil.io/redirect',
  ]);
});

describe('loopback redirects', () => {
  accepts([
    'http://localhost/cb',
    'https://localhost:8787/cb',
    'http://127.0.0.1:1/cb',
    'https://[::1]/cb',
    'http://[::1]:9/x',
  ]);
  rejects([
    'http://127.0.0.2/cb',
    'http://localhost.evil.com/cb',
    'http://user@127.0.0.1/cb',
    'http://localhost./cb',
    'http://localhost/cb#fragment',
    'myapp://oauth/callback',
  ]);
});

describe('MCP redirect registration errors', () => {
  it('names the rejected redirect and the allowed client families', () => {
    expect(() =>
      acceptedMcpRedirectUris(['https://evilcursor.com/cb'])
    ).toThrow(
      `redirect_uri "https://evilcursor.com/cb" is not allowed. Allowed clients: ${MCP_REDIRECT_CLIENT_FAMILIES}.`
    );
  });

  it('does not echo non-string redirect values', () => {
    expect(() =>
      acceptedMcpRedirectUris([{ client_secret: 'super-secret-value' }])
    ).toThrow(
      `redirect_uri is not allowed. Allowed clients: ${MCP_REDIRECT_CLIENT_FAMILIES}.`
    );
    try {
      acceptedMcpRedirectUris([{ client_secret: 'super-secret-value' }]);
    } catch (error) {
      expect(String(error)).not.toContain('super-secret-value');
    }
  });
});
