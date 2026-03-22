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
import { type BrowserContext, chromium, type Page } from 'playwright';

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
  const data = await res.json();
  return data.token;
}

async function ensureTestUser(email: string): Promise<void> {
  const searchRes = await fetch(
    `https://api.clerk.com/v1/users?email_address=${encodeURIComponent(email)}&limit=1`,
    { headers: { Authorization: `Bearer ${CLERK_SECRET_KEY}` } }
  );
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

async function enterOtp(page: Page): Promise<void> {
  await page.waitForTimeout(2000);

  const codeInput = page.locator('input[autocomplete="one-time-code"]').first();
  if (await codeInput.isVisible({ timeout: 5000 })) {
    console.log(`Entering magic code: ${MAGIC_CODE}`);
    await codeInput.fill(MAGIC_CODE);
    return;
  }

  // Fallback: individual digit inputs
  const digitInputs = page.locator('input[inputmode="numeric"]');
  const count = await digitInputs.count();
  if (count > 0) {
    console.log(`Found ${count} digit inputs, entering code...`);
    for (let i = 0; i < Math.min(count, MAGIC_CODE.length); i++) {
      await digitInputs.nth(i).fill(MAGIC_CODE[i]);
    }
    return;
  }

  await page.screenshot({ path: '/tmp/browse-auth-otp-debug.png' });
  console.log(
    'Could not find OTP input. Debug screenshot: /tmp/browse-auth-otp-debug.png'
  );
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

  // Navigate to sign-in
  console.log('Navigating to sign-in...');
  await page.goto(`${SITE_URL}/signin`, { waitUntil: 'networkidle' });

  // Click "Continue with email"
  console.log('Clicking "Continue with email"...');
  await page.getByRole('button', { name: 'Continue with email' }).click();
  await page.waitForTimeout(500);

  // Fill email and submit
  console.log(`Entering email: ${TEST_EMAIL}`);
  await page.getByLabel('Email Address').fill(TEST_EMAIL);
  await page.getByRole('button', { name: 'Continue with email' }).click();

  // Enter OTP
  console.log('Waiting for OTP input...');
  try {
    await enterOtp(page);
  } catch (err) {
    await page.screenshot({ path: '/tmp/browse-auth-otp-debug.png' });
    console.log(
      `OTP step error: ${err}. Debug screenshot: /tmp/browse-auth-otp-debug.png`
    );
  }

  // Wait for auth redirect
  console.log('Waiting for auth redirect...');
  try {
    await page.waitForURL(url => !url.toString().includes('/signin'), {
      timeout: 15000,
    });
    console.log(`Redirected to: ${page.url()}`);
  } catch {
    console.log(`Still on: ${page.url()}`);
    await page.screenshot({ path: '/tmp/browse-auth-debug.png' });
    console.log('Debug screenshot: /tmp/browse-auth-debug.png');
  }

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
    console.log('No session cookie — authentication may have failed');
    await page.screenshot({ path: '/tmp/browse-auth-debug.png' });
    console.log('Debug screenshot: /tmp/browse-auth-debug.png');
  }

  await browser.close();
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
