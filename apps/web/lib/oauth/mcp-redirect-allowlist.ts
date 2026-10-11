const CURSOR_APP_HOST = 'anysphere.cursor-mcp';
const CURSOR_APP_PATH = '/oauth/callback';
const CLAUDE_HOST = 'claude.ai';
const CLAUDE_CALLBACK_PATH = '/api/mcp/auth_callback';
const VSCODE_CALLBACK_PATH = '/redirect';
const VSCODE_HOSTS = new Set(['vscode.dev', 'insiders.vscode.dev']);
const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '::1', '[::1]']);
const REDIRECT_ECHO_LIMIT = 2048;

export const MCP_REDIRECT_CLIENT_FAMILIES =
  'ChatGPT, Claude, Cursor, VS Code, and localhost';

export class McpRedirectMetadataError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'McpRedirectMetadataError';
  }
}

function hostOf(url: URL): string {
  return url.hostname.toLowerCase();
}

function hasUserinfo(url: URL): boolean {
  return url.username !== '' || url.password !== '';
}

function isCursorDotComHost(hostname: string): boolean {
  const host = hostname.toLowerCase();
  if (host === 'cursor.com') return true;
  if (!host.endsWith('.cursor.com')) return false;
  const label = host.slice(0, -'.cursor.com'.length);
  return label.length > 0 && !label.endsWith('.') && !label.includes('..');
}

function isPinnedHttpsCallback(
  url: URL,
  host: string,
  pathname: string
): boolean {
  return (
    url.protocol === 'https:' &&
    !hasUserinfo(url) &&
    url.port === '' &&
    url.search === '' &&
    url.hash === '' &&
    hostOf(url) === host &&
    url.pathname === pathname
  );
}

function isChatGptRedirect(url: URL): boolean {
  if (url.protocol !== 'https:' || hasUserinfo(url) || url.hash !== '') {
    return false;
  }
  const host = hostOf(url);
  return (
    host === 'chatgpt.com' ||
    host === 'chat.openai.com' ||
    host.endsWith('.chatgpt.com')
  );
}

function isClaudeRedirect(url: URL): boolean {
  return isPinnedHttpsCallback(url, CLAUDE_HOST, CLAUDE_CALLBACK_PATH);
}

function isCursorHttpsRedirect(url: URL): boolean {
  if (url.protocol !== 'https:' || hasUserinfo(url) || url.hash !== '') {
    return false;
  }
  return isCursorDotComHost(url.hostname);
}

function isCursorAppRedirect(url: URL): boolean {
  return (
    url.protocol === 'cursor:' &&
    !hasUserinfo(url) &&
    url.port === '' &&
    url.search === '' &&
    url.hash === '' &&
    hostOf(url) === CURSOR_APP_HOST &&
    url.pathname === CURSOR_APP_PATH
  );
}

function isVsCodeRedirect(url: URL): boolean {
  if (
    url.protocol !== 'https:' ||
    hasUserinfo(url) ||
    url.port !== '' ||
    url.search !== '' ||
    url.hash !== '' ||
    url.pathname !== VSCODE_CALLBACK_PATH
  ) {
    return false;
  }
  return VSCODE_HOSTS.has(hostOf(url));
}

function isLoopbackRedirect(url: URL): boolean {
  if (
    (url.protocol !== 'http:' && url.protocol !== 'https:') ||
    hasUserinfo(url) ||
    url.hash !== ''
  ) {
    return false;
  }
  return LOOPBACK_HOSTS.has(hostOf(url));
}

/** MCP OAuth redirect allowlist shared by Ovie and Better Auth. */
export function isAllowedMcpRedirectUri(uri: string): boolean {
  try {
    const url = new URL(uri);
    return (
      isLoopbackRedirect(url) ||
      isCursorAppRedirect(url) ||
      isChatGptRedirect(url) ||
      isClaudeRedirect(url) ||
      isCursorHttpsRedirect(url) ||
      isVsCodeRedirect(url)
    );
  } catch {
    return false;
  }
}

function echoRedirect(uri: string): string {
  const shown =
    uri.length > REDIRECT_ECHO_LIMIT
      ? `${uri.slice(0, REDIRECT_ECHO_LIMIT)}…`
      : uri;
  return JSON.stringify(shown);
}

export function mcpRedirectRejection(uri: unknown): string {
  const target =
    typeof uri === 'string'
      ? `redirect_uri ${echoRedirect(uri)}`
      : 'redirect_uri';
  return `${target} is not allowed. Allowed clients: ${MCP_REDIRECT_CLIENT_FAMILIES}.`;
}

/**
 * Accept only an array of allowlisted redirect URIs. A rejected entry fails
 * the whole registration and is named in the error. Non-strings are not echoed.
 */
export function acceptedMcpRedirectUris(value: unknown): readonly string[] {
  if (!Array.isArray(value) || value.length === 0) {
    throw new McpRedirectMetadataError(
      `redirect_uris must include a ChatGPT, Claude, Cursor, VS Code, or localhost URI. Allowed clients: ${MCP_REDIRECT_CLIENT_FAMILIES}.`
    );
  }
  const accepted: string[] = [];
  const rejected: unknown[] = [];
  for (const entry of value) {
    if (typeof entry === 'string' && isAllowedMcpRedirectUri(entry)) {
      accepted.push(entry);
    } else {
      rejected.push(entry);
    }
  }
  if (rejected.length > 0) {
    throw new McpRedirectMetadataError(mcpRedirectRejection(rejected[0]));
  }
  return accepted;
}
