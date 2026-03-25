/**
 * Authenticates a Clerk test user via email + OTP and exports session cookies for /browse.
 *
 * Usage:
 *   doppler run -c dev -- bun run scripts/browse-auth.ts [email]
 *
 * Default email: browse+clerk_test@jov.ie (uses magic OTP code 424242)
 * Outputs cookies to /tmp/browse-clerk-cookies.json
 * Then import: $B cookie-import /tmp/browse-clerk-cookies.json
 */
import { writeFileSync } from 'fs';
import { type BrowserContext, chromium } from 'playwright';

const CLERK_SECRET_KEY = process.env.CLERK_SECRET_KEY!;
const CLERK_PK = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY!;
const SITE_URL = process.env.SITE_URL || 'http://localhost:3000';
const TEST_EMAIL = process.argv[2] || 'browse+clerk_test@jov.ie';
const MAGIC_CODE = '424242';
const TESTING_TOKEN_PARAM = '__clerk_testing_token';

if (!CLERK_SECRET_KEY) {
  console.error(
    'Missing CLERK_SECRET_KEY. Run with: doppler run -c dev -- bun run scripts/browse-auth.ts'
  );
  process.exit(1);
}

if (!CLERK_PK) {
  console.error(
    'Missing NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY. Run with: doppler run -c dev -- bun run scripts/browse-auth.ts'
  );
  process.exit(1);
}

/** Parse Clerk Frontend API hostname from publishable key */
function parseFrontendApi(pk: string): string {
  // pk_test_<base64> or pk_live_<base64> — the base64 decodes to the FAPI URL
  const match = pk.match(/^pk_(test|live)_(.+)$/);
  if (!match)
    throw new Error(
      `Invalid publishable key format: ${pk.substring(0, 15)}...`
    );
  const decoded = Buffer.from(match[2], 'base64').toString('utf-8');
  // decoded is like "distinct-giraffe-5.clerk.accounts.dev$"
  return decoded.replace(/\$$/, '');
}

async function getTestingToken(): Promise<string> {
  const res = await fetch('https://api.clerk.com/v1/testing_tokens', {
    method: 'POST',
    headers: { Authorization: `Bearer ${CLERK_SECRET_KEY}` },
  });
  if (!res.ok) {
    throw new Error(
      `Failed to get testing token: ${res.status} ${res.statusText}`
    );
  }
  const data = await res.json();
  if (!data.token) {
    throw new Error(
      `Testing token response missing token field: ${JSON.stringify(data)}`
    );
  }
  return data.token;
}

async function ensureTestUser(email: string): Promise<void> {
  const searchRes = await fetch(
    `https://api.clerk.com/v1/users?email_address=${encodeURIComponent(email)}&limit=1`,
    { headers: { Authorization: `Bearer ${CLERK_SECRET_KEY}` } }
  );
  if (!searchRes.ok) {
    throw new Error(
      `Clerk user search failed: ${searchRes.status} ${searchRes.statusText}`
    );
  }
  const users = await searchRes.json();
  if (Array.isArray(users) && users.length > 0) {
    console.log(`Test user exists: ${users[0].id}`);
    return;
  }

  console.log(`Creating test user: ${email}`);
  const createRes = await fetch('https://api.clerk.com/v1/users', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${CLERK_SECRET_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      email_address: [email],
      first_name: 'Browse',
      last_name: 'Bot',
    }),
  });
  if (!createRes.ok) {
    throw new Error(
      `Clerk user create failed: ${createRes.status} ${await createRes.text()}`
    );
  }
  const created = await createRes.json();
  if (created.errors) {
    throw new Error(`Failed to create user: ${JSON.stringify(created.errors)}`);
  }
  console.log(`Created test user: ${created.id}`);
}

/**
 * Replicates @clerk/testing/playwright's setupClerkTestingToken behavior:
 * - Uses context.route() (persists across navigations, unlike page.route)
 * - Only matches Clerk Frontend API /v1/* URLs
 * - Patches captcha_bypass in responses
 */
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
      // Patch captcha bypass flags (like the official library does)
      if (json?.response?.captcha_bypass === false) {
        json.response.captcha_bypass = true;
      }
      if (json?.client?.captcha_bypass === false) {
        json.client.captcha_bypass = true;
      }
      await route.fulfill({ response, json });
    } catch {
      await route.continue({ url: url.toString() }).catch(console.error);
    }
  });
}

async function main() {
  console.log(`Site: ${SITE_URL}`);
  console.log(`Email: ${TEST_EMAIL}`);

  await ensureTestUser(TEST_EMAIL);

  const fapiHost = parseFrontendApi(CLERK_PK);
  const testingToken = await getTestingToken();
  console.log(`FAPI: ${fapiHost}`);
  console.log('Got testing token');

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();

  // Set up testing token interception at context level (persists across navigations)
  await setupClerkTestingToken(context, fapiHost, testingToken);

  const page = await context.newPage();

  // Debug: log console messages and network errors
  page.on('console', msg => {
    if (msg.type() === 'error') console.log(`[CONSOLE ERROR] ${msg.text()}`);
  });
  page.on('pageerror', err => console.log(`[PAGE ERROR] ${err.message}`));
  page.on('requestfailed', req =>
    console.log(`[REQUEST FAILED] ${req.url()} - ${req.failure()?.errorText}`)
  );

  // Navigate to sign-in
  console.log('Navigating to sign-in...');
  await page.goto(`${SITE_URL}/signin`, {
    waitUntil: 'domcontentloaded',
    timeout: 60000,
  });

  // Wait for Clerk JS to load
  console.log('Waiting for Clerk to load...');
  try {
    await page.waitForFunction(() => !!(window as any).Clerk?.loaded, {
      timeout: 30000,
    });
  } catch {
    // Debug: check what state Clerk is in
    const clerkState = await page.evaluate(() => ({
      hasClerk: !!(window as any).Clerk,
      loaded: (window as any).Clerk?.loaded,
      version: (window as any).Clerk?.version,
      url: window.location.href,
      title: document.title,
    }));
    console.log('Clerk state:', JSON.stringify(clerkState));
    await page.screenshot({ path: '/tmp/browse-auth-clerk-debug.png' });
    console.log('Debug screenshot: /tmp/browse-auth-clerk-debug.png');

    // Try a reload and wait again
    console.log('Reloading page...');
    await page.reload({ waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForFunction(() => !!(window as any).Clerk?.loaded, {
      timeout: 30000,
    });
  }

  // Use Clerk's client-side signIn API via the testing token
  console.log(`Signing in as: ${TEST_EMAIL}`);
  const signInResult = await page.evaluate(
    async ({ email, code }) => {
      const clerk = (window as any).Clerk;
      if (!clerk) return { error: 'Clerk not loaded' };

      try {
        // Start sign-in with email_code strategy
        const signIn = await clerk.client.signIn.create({
          identifier: email,
          strategy: 'email_code',
        });

        // Attempt first factor with the magic OTP code
        const result = await signIn.attemptFirstFactor({
          strategy: 'email_code',
          code,
        });

        if (result.status === 'complete') {
          // Set the active session
          await clerk.setActive({ session: result.createdSessionId });
          return { success: true, sessionId: result.createdSessionId };
        }
        return { error: `Sign-in status: ${result.status}` };
      } catch (err: unknown) {
        return { error: err instanceof Error ? err.message : String(err) };
      }
    },
    { email: TEST_EMAIL, code: MAGIC_CODE }
  );

  if ('error' in signInResult && signInResult.error) {
    console.error(`Sign-in failed: ${signInResult.error}`);
    await page.screenshot({ path: '/tmp/browse-auth-debug.png' });
    console.log('Debug screenshot: /tmp/browse-auth-debug.png');
  } else {
    console.log(`Sign-in successful, session: ${signInResult.sessionId}`);
  }

  // Navigate to app to ensure cookies are set
  console.log('Navigating to app...');
  await page.goto(`${SITE_URL}/app/dashboard/releases`, {
    waitUntil: 'domcontentloaded',
    timeout: 60000,
  });
  await page.waitForTimeout(2000);
  console.log(`Current URL: ${page.url()}`);

  // Export cookies
  const cookies = await context.cookies();
  writeFileSync(
    '/tmp/browse-clerk-cookies.json',
    JSON.stringify(cookies, null, 2)
  );
  console.log(
    `Exported ${cookies.length} cookies to /tmp/browse-clerk-cookies.json`
  );

  const sessionCookie = cookies.find(c => c.name === '__session');
  if (sessionCookie) {
    console.log('Session cookie found — authentication successful');
    await page.screenshot({ path: '/tmp/browse-auth-success.png' });
    console.log('Success screenshot: /tmp/browse-auth-success.png');
  } else {
    console.error('No session cookie — authentication failed');
    await page.screenshot({ path: '/tmp/browse-auth-debug.png' });
    console.log('Debug screenshot: /tmp/browse-auth-debug.png');
    await browser.close();
    process.exit(1);
  }

  await browser.close();
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
