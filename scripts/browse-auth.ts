#!/usr/bin/env tsx

import { writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { type BrowserContext, chromium } from 'playwright';

const DEFAULT_BASE_URL = 'http://localhost:3000';
const DEFAULT_OUTPUT_PATH = '/tmp/browse-clerk-cookies.json';
const DEFAULT_CREATOR_EMAIL = 'browse+clerk_test@jov.ie';
const DEFAULT_ADMIN_EMAIL = 'browse-admin+clerk_test@jov.ie';
const MAGIC_CODE = '424242';
const TESTING_TOKEN_PARAM = '__clerk_testing_token';
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

function isPrivateOrLoopbackHost(hostname: string): boolean {
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

function parseFrontendApi(pk: string): string {
  const match = pk.match(/^pk_(test|live)_(.+)$/);
  if (!match) {
    throw new Error(
      `Invalid publishable key format: ${pk.substring(0, 15)}...`
    );
  }

  const decoded = Buffer.from(match[2], 'base64').toString('utf-8');
  return decoded.replace(/\$$/, '');
}

function getPersonaEmail(persona: BrowseAuthPersona): string {
  if (persona === 'admin') {
    return (
      process.env.E2E_CLERK_ADMIN_USERNAME ??
      process.env.E2E_CLERK_USER_USERNAME ??
      DEFAULT_ADMIN_EMAIL
    );
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
    throw new Error(
      `Local browse auth failed: ${response.status} ${await response.text()}`
    );
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

async function getTestingToken(secretKey: string): Promise<string> {
  const response = await fetch('https://api.clerk.com/v1/testing_tokens', {
    method: 'POST',
    headers: { Authorization: `Bearer ${secretKey}` },
  });

  if (!response.ok) {
    throw new Error(
      `Failed to get testing token: ${response.status} ${response.statusText}`
    );
  }

  const data = (await response.json()) as { token?: string };
  if (!data.token) {
    throw new Error('Testing token response missing token field');
  }

  return data.token;
}

async function ensureFallbackTestUser(
  secretKey: string,
  email: string
): Promise<void> {
  const searchResponse = await fetch(
    `https://api.clerk.com/v1/users?email_address=${encodeURIComponent(email)}&limit=1`,
    {
      headers: { Authorization: `Bearer ${secretKey}` },
    }
  );

  if (!searchResponse.ok) {
    throw new Error(
      `Clerk user search failed: ${searchResponse.status} ${searchResponse.statusText}`
    );
  }

  const users = (await searchResponse.json()) as Array<{ id: string }>;
  if (users.length > 0) {
    return;
  }

  const createResponse = await fetch('https://api.clerk.com/v1/users', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${secretKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      email_address: [email],
      first_name: 'Browse',
      last_name: 'Bot',
      skip_password_requirement: true,
    }),
  });

  if (!createResponse.ok) {
    throw new Error(
      `Clerk user create failed: ${createResponse.status} ${await createResponse.text()}`
    );
  }
}

async function setupClerkTestingToken(
  context: BrowserContext,
  fapiHost: string,
  testingToken: string
): Promise<void> {
  const escapedHost = fapiHost.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const fapiPattern = new RegExp(`^https://${escapedHost}/v1/.*?(\\?.*)?$`);

  await context.route(fapiPattern, async route => {
    const url = new URL(route.request().url());
    url.searchParams.set(TESTING_TOKEN_PARAM, testingToken);

    try {
      const response = await route.fetch({ url: url.toString() });
      const json = await response.json();
      if (json?.response?.captcha_bypass === false) {
        json.response.captcha_bypass = true;
      }
      if (json?.client?.captcha_bypass === false) {
        json.client.captcha_bypass = true;
      }
      await route.fulfill({ response, json });
    } catch {
      await route.continue({ url: url.toString() });
    }
  });
}

async function runClerkFallbackFlow(args: BrowseAuthArgs) {
  const secretKey = process.env.CLERK_SECRET_KEY;
  const publishableKey = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;

  if (!secretKey) {
    throw new Error(
      'Missing CLERK_SECRET_KEY. Run with: doppler run -- pnpm tsx scripts/browse-auth.ts'
    );
  }

  if (!publishableKey) {
    throw new Error(
      'Missing NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY. Run with: doppler run -- pnpm tsx scripts/browse-auth.ts'
    );
  }

  const email = getPersonaEmail(args.persona);
  await ensureFallbackTestUser(secretKey, email);

  const fapiHost = parseFrontendApi(publishableKey);
  const testingToken = await getTestingToken(secretKey);

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  await setupClerkTestingToken(context, fapiHost, testingToken);

  const page = await context.newPage();
  await page.goto(`${args.baseUrl}/signin`, {
    waitUntil: 'domcontentloaded',
    timeout: 60_000,
  });
  await page.waitForFunction(
    () => Boolean((window as { Clerk?: { loaded?: boolean } }).Clerk?.loaded),
    {
      timeout: 30_000,
    }
  );

  const signInResult = await page.evaluate(
    async ({ email, code }) => {
      const clerk = (window as { Clerk?: any }).Clerk;
      if (!clerk) {
        return { error: 'Clerk not loaded' };
      }

      try {
        const signIn = await clerk.client.signIn.create({
          identifier: email,
          strategy: 'email_code',
        });

        const result = await signIn.attemptFirstFactor({
          strategy: 'email_code',
          code,
        });

        if (result.status === 'complete') {
          await clerk.setActive({ session: result.createdSessionId });
          return { success: true };
        }

        return { error: `Sign-in status: ${result.status}` };
      } catch (error: unknown) {
        return {
          error: error instanceof Error ? error.message : String(error),
        };
      }
    },
    { email, code: MAGIC_CODE }
  );

  if ('error' in signInResult && signInResult.error) {
    throw new Error(`Fallback sign-in failed: ${signInResult.error}`);
  }

  await page.goto(`${args.baseUrl}/app/dashboard/earnings`, {
    waitUntil: 'domcontentloaded',
    timeout: 60_000,
  });

  writeCookieExport(args.output, await context.cookies());
  await browser.close();
}

async function main() {
  const args = parseBrowseAuthArgs(process.argv.slice(2));
  const baseUrl = new URL(args.baseUrl);

  console.log(`Base URL: ${baseUrl.toString()}`);
  console.log(`Persona: ${args.persona}`);

  if (isPrivateOrLoopbackHost(baseUrl.hostname)) {
    await runLocalBypassFlow(args);
    return;
  }

  console.log('Mode: Clerk fallback');
  await runClerkFallbackFlow(args);
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
