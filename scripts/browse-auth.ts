#!/usr/bin/env tsx

import { writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const DEFAULT_BASE_URL = 'http://localhost:3000';
const DEFAULT_OUTPUT_PATH = '/tmp/browse-auth-cookies.json';
const DEFAULT_CREATOR_EMAIL = 'browse+clerk_test@jov.ie';
const DEFAULT_ADMIN_EMAIL = 'browse-admin+clerk_test@jov.ie';
const PRIVATE_IPV4_BLOCKS = [
  /^10\./,
  /^127\./,
  /^192\.168\./,
  /^172\.(1[6-9]|2\d|3[0-1])\./,
] as const;

type BrowseAuthPersona = 'creator' | 'admin';
type SameSitePolicy = 'Lax' | 'Strict' | 'None';

interface BrowseAuthArgs {
  readonly baseUrl: string;
  readonly output: string;
  readonly persona: BrowseAuthPersona;
}

interface ExportedCookie {
  readonly name: string;
  readonly value: string;
  readonly domain: string;
  readonly path: string;
  readonly expires: number;
  readonly httpOnly: boolean;
  readonly secure: boolean;
  readonly sameSite: SameSitePolicy;
}

export function isPrivateOrLoopbackHost(hostname: string): boolean {
  const normalizedHostname = hostname.trim().toLowerCase();

  return (
    normalizedHostname === 'localhost' ||
    normalizedHostname === '::1' ||
    normalizedHostname === '[::1]' ||
    normalizedHostname.endsWith('.localhost') ||
    normalizedHostname.endsWith('.local') ||
    PRIVATE_IPV4_BLOCKS.some(pattern => pattern.test(normalizedHostname))
  );
}

export function parseBrowseAuthArgs(argv: readonly string[]): BrowseAuthArgs {
  let baseUrl = DEFAULT_BASE_URL;
  let output = DEFAULT_OUTPUT_PATH;
  let persona: BrowseAuthPersona = 'creator';

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const nextValue = argv[index + 1];

    if (arg === '--base-url' && nextValue) {
      baseUrl = nextValue;
      index += 1;
      continue;
    }

    if (arg === '--output' && nextValue) {
      output = nextValue;
      index += 1;
      continue;
    }

    if (arg === '--persona' && nextValue) {
      if (nextValue === 'creator' || nextValue === 'admin') {
        persona = nextValue;
        index += 1;
        continue;
      }

      throw new Error(`Invalid persona "${nextValue}"`);
    }
  }

  return {
    baseUrl,
    output,
    persona,
  };
}

export function getPersonaEmail(persona: BrowseAuthPersona): string {
  if (persona === 'admin') {
    return process.env.E2E_CLERK_ADMIN_USERNAME ?? DEFAULT_ADMIN_EMAIL;
  }

  return DEFAULT_CREATOR_EMAIL;
}

function getSetCookieHeaders(headers: Headers): string[] {
  const headerBag = headers as Headers & {
    getSetCookie?: () => string[];
  };

  if (typeof headerBag.getSetCookie === 'function') {
    return headerBag.getSetCookie();
  }

  const singleHeader = headers.get('set-cookie');
  return singleHeader ? [singleHeader] : [];
}

export function parseSetCookieHeaders(
  setCookieHeaders: readonly string[],
  baseUrl: URL
): ExportedCookie[] {
  return setCookieHeaders.map(headerValue => {
    const parts = headerValue.split(';').map(part => part.trim());
    const [nameValue, ...attributeParts] = parts;
    const [name = '', ...valueParts] = nameValue.split('=');
    const attributes = new Map<string, string>();

    for (const attributePart of attributeParts) {
      const [attributeName, ...attributeValueParts] = attributePart.split('=');
      attributes.set(
        attributeName.toLowerCase(),
        attributeValueParts.join('=').trim()
      );
    }

    const sameSiteValue = attributes.get('samesite');
    const normalizedSameSite =
      sameSiteValue === 'None' || sameSiteValue === 'Strict'
        ? sameSiteValue
        : 'Lax';
    const expiresValue = attributes.get('expires');
    const maxAgeValue = attributes.get('max-age');

    let expires = -1;
    if (maxAgeValue) {
      const maxAgeSeconds = Number(maxAgeValue);
      if (Number.isFinite(maxAgeSeconds)) {
        expires = Math.floor(Date.now() / 1000) + maxAgeSeconds;
      }
    } else if (expiresValue) {
      const parsedExpiry = Date.parse(expiresValue);
      if (!Number.isNaN(parsedExpiry)) {
        expires = Math.floor(parsedExpiry / 1000);
      }
    }

    return {
      name,
      value: valueParts.join('='),
      domain: attributes.get('domain') || baseUrl.hostname,
      path: attributes.get('path') || '/',
      expires,
      httpOnly: attributes.has('httponly'),
      secure: attributes.has('secure'),
      sameSite: normalizedSameSite,
    };
  });
}

function writeCookieExport(
  outputPath: string,
  cookies: readonly ExportedCookie[]
) {
  writeFileSync(outputPath, JSON.stringify(cookies, null, 2));
  console.log(`Cookies exported: ${outputPath}`);
}

class LocalBypassError extends Error {
  constructor(
    readonly status: number,
    readonly body: string
  ) {
    super(`Local browse auth failed: ${status} ${body}`);
    this.name = 'LocalBypassError';
  }
}

async function runLocalBypassFlow(args: BrowseAuthArgs) {
  const baseUrl = new URL(args.baseUrl);
  const response = await fetch(new URL('/api/dev/test-auth/session', baseUrl), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ persona: args.persona }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new LocalBypassError(response.status, errorText);
  }

  const payload = (await response.json()) as {
    success: boolean;
    persona: BrowseAuthPersona;
    userId: string;
    email: string;
    profilePath: string | null;
  };

  const cookies = parseSetCookieHeaders(
    getSetCookieHeaders(response.headers),
    baseUrl
  );

  writeCookieExport(args.output, cookies);

  console.log(
    `Local mode: authenticated ${payload.email} (${payload.persona})`
  );
  console.log(
    `Browse entrypoint: ${new URL(
      `/api/dev/test-auth/enter?persona=${payload.persona}&redirect=/app/dashboard/earnings`,
      baseUrl
    ).toString()}`
  );
}

export async function runBrowseAuth(args: BrowseAuthArgs): Promise<void> {
  const baseUrl = new URL(args.baseUrl);

  if (!isPrivateOrLoopbackHost(baseUrl.hostname)) {
    throw new Error(
      'browse-auth only supports loopback/private hosts via E2E_USE_TEST_AUTH_BYPASS. Clerk fallback is retired.'
    );
  }

  await runLocalBypassFlow(args);
}

async function main() {
  const args = parseBrowseAuthArgs(process.argv.slice(2));
  const baseUrl = new URL(args.baseUrl);

  console.log(`Base URL: ${baseUrl.toString()}`);
  console.log(`Persona: ${args.persona}`);
  console.log('Mode: Better Auth test-auth bypass');

  await runBrowseAuth(args);
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  main().catch(error => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}
