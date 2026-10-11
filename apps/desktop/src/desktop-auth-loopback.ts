import { createServer, type Server } from 'node:http';
import {
  DESKTOP_AUTH_FLOW_PATTERN,
  isValidNativeAuthToken,
  type ParsedAuthReturnDeepLink,
} from './desktop-auth-security';

/**
 * Loopback auth return for the browser handoff (RFC 8252 section 7.3).
 *
 * While a sign-in flow is pending, the app listens on 127.0.0.1 with an
 * ephemeral port and advertises it to `/auth/start` as `desktop_loopback`.
 * `/auth/native-return` then hands the same code/state/desktop_flow the
 * `jovie://auth/complete` deep link carries straight to this listener, so
 * sign-in completes with zero typing even when the custom scheme is not
 * handled (no registered client, another copy owns it, blocked prompt).
 *
 * Same-device by construction: a request here can only come from a page
 * running in a browser on this machine. The completion still binds to the
 * pending flow nonce, and the exchange still requires the PKCE verifier —
 * the loopback carries no secret the deep link does not.
 */

export const DESKTOP_AUTH_LOOPBACK_PATH = '/auth/complete';
export const DESKTOP_AUTH_LOOPBACK_HOST = '127.0.0.1';

export interface DesktopAuthLoopbackServer {
  readonly port: number;
  close(): void;
}

function parseLoopbackCompletion(
  requestUrl: string | undefined
): ParsedAuthReturnDeepLink | null {
  if (!requestUrl) return null;
  let parsed: URL;
  try {
    parsed = new URL(requestUrl, `http://${DESKTOP_AUTH_LOOPBACK_HOST}`);
  } catch {
    return null;
  }
  if (parsed.pathname !== DESKTOP_AUTH_LOOPBACK_PATH) return null;

  const code = parsed.searchParams.get('code')?.trim() ?? '';
  const state = parsed.searchParams.get('state')?.trim() ?? '';
  if (!isValidNativeAuthToken(code) || !isValidNativeAuthToken(state)) {
    return null;
  }

  const flowNonce = parsed.searchParams.get('desktop_flow')?.trim() ?? '';
  return {
    code,
    state,
    flowNonce: DESKTOP_AUTH_FLOW_PATTERN.test(flowNonce) ? flowNonce : null,
  };
}

const LOOPBACK_PAGE_STYLE =
  'margin:0;min-height:100dvh;display:flex;align-items:center;justify-content:center;background:#0b0b0b;color:#f5f4f0;font-family:Inter,-apple-system,BlinkMacSystemFont,Segoe UI,sans-serif;';

function loopbackPage(title: string, body: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${title} · Jovie</title>
</head>
<body style="${LOOPBACK_PAGE_STYLE}">
<main style="max-width:400px;padding:32px 24px;text-align:center;">
<h1 style="margin:0 0 12px;font-size:20px;font-weight:600;letter-spacing:-0.01em;">${title}</h1>
<p style="margin:0;font-size:15px;line-height:1.5;color:#a1a1a6;">${body}</p>
</main>
</body>
</html>`;
}

const LOOPBACK_COMPLETE_PAGE = loopbackPage(
  'Return to Jovie',
  'Sign-in is complete. You can close this tab.'
);
const LOOPBACK_INACTIVE_PAGE = loopbackPage(
  'Sign-in no longer active',
  'Start sign-in again from the Jovie app.'
);

// Private Network Access preflights from the public https page expect these
// on the loopback response. The request carries no credentials and only a
// same-device completion payload, so a wildcard origin is safe here.
const LOOPBACK_CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Private-Network': 'true',
} as const;

export function startDesktopAuthLoopbackServer(input: {
  readonly onComplete: (
    completion: ParsedAuthReturnDeepLink
  ) => 'completed' | 'unmatched';
  readonly createServer?: typeof createServer;
}): Promise<DesktopAuthLoopbackServer | null> {
  const makeServer = input.createServer ?? createServer;

  return new Promise(resolve => {
    const server: Server = makeServer((request, response) => {
      if (request.method === 'OPTIONS') {
        response.writeHead(204, {
          ...LOOPBACK_CORS_HEADERS,
          'Access-Control-Allow-Methods': 'GET, OPTIONS',
        });
        response.end();
        return;
      }

      if (request.method !== 'GET') {
        response.writeHead(405, LOOPBACK_CORS_HEADERS);
        response.end();
        return;
      }

      const completion = parseLoopbackCompletion(request.url);
      if (!completion) {
        response.writeHead(404, LOOPBACK_CORS_HEADERS);
        response.end();
        return;
      }

      const outcome = input.onComplete(completion);
      response.writeHead(200, {
        ...LOOPBACK_CORS_HEADERS,
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': 'no-store',
      });
      response.end(
        outcome === 'completed'
          ? LOOPBACK_COMPLETE_PAGE
          : LOOPBACK_INACTIVE_PAGE
      );
    });

    server.once('error', () => resolve(null));
    // Never let the listener keep the process alive on quit.
    server.unref();
    server.listen(0, DESKTOP_AUTH_LOOPBACK_HOST, () => {
      const address = server.address();
      const port =
        address !== null && typeof address === 'object' ? address.port : 0;
      if (!port) {
        server.close();
        resolve(null);
        return;
      }
      resolve({
        port,
        close: () => {
          server.close();
        },
      });
    });
  });
}
