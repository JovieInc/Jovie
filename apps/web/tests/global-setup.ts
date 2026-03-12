import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { clerkSetup } from '@clerk/testing/playwright';
import { config } from 'dotenv';
import path from 'path';
import { APP_ROUTES } from '../constants/routes';
import { seedTestData } from './seed-test-data';

// Load environment variables in priority order (first-loaded wins with override: false)
const webRoot = path.resolve(__dirname, '..');
const repoRoot = path.resolve(webRoot, '../..');

config({ path: path.join(webRoot, '.env.development.local') }); // E2E creds
config({ path: path.join(repoRoot, '.env.local') }); // Real Clerk keys
config({ path: path.join(repoRoot, '.env.test') }); // Fallback defaults

const isCI = !!process.env.CI;
const isSmokeOnly = process.env.SMOKE_ONLY === '1';
const isPublicNoAuthOnly = process.env.PUBLIC_NOAUTH_SMOKE === '1';
const isFastIteration = process.env.E2E_FAST_ITERATION === '1';
const isAuthRefreshOnly = process.env.E2E_AUTH_REFRESH_ONLY === '1';
const useStoredAuth = process.env.E2E_USE_STORED_AUTH === '1';
const shouldSkipSeeding =
  isAuthRefreshOnly || isFastIteration || process.env.E2E_SKIP_SEED === '1';
const shouldSkipWarmup =
  isAuthRefreshOnly || process.env.E2E_SKIP_WARMUP === '1';
const authStatePath = path.join(webRoot, 'tests', '.auth', 'user.json');
const hasStoredAuthState = existsSync(authStatePath);
const warmupCacheDir = path.join(webRoot, 'tests', '.cache');
const warmupStampPath = path.join(warmupCacheDir, 'fast-warmup.json');
const warmupStampMaxAgeMs = Number(
  process.env.E2E_WARMUP_MAX_AGE_MS ?? 60 * 60 * 1000
);
const WRAP_LINK_WARMUP_IP = '198.51.100.250';
const CHALLENGE_TOKEN_PATTERNS = [
  /"challengeToken":"([^"]+)"/,
  /\\"challengeToken\\":\\"([^"]+)\\"/,
];

function extractChallengeToken(html: string) {
  for (const pattern of CHALLENGE_TOKEN_PATTERNS) {
    const match = html.match(pattern);
    if (match?.[1]) {
      return match[1];
    }
  }

  return null;
}

const SENSITIVE_PATTERNS = [
  'dummy',
  'mock',
  '1234567890',
  'test-key',
  'placeholder',
];

function isRealKey(key: string | undefined): key is string {
  if (!key) return false;
  const lowerKey = key.toLowerCase();
  return !SENSITIVE_PATTERNS.some(pattern => lowerKey.includes(pattern));
}

function hasFreshWarmupStamp(baseURL: string): boolean {
  if (!existsSync(warmupStampPath)) return false;

  try {
    const raw = readFileSync(warmupStampPath, 'utf8');
    const parsed = JSON.parse(raw) as {
      baseURL?: string;
      warmedAt?: number;
    };
    if (parsed.baseURL !== baseURL) return false;
    if (typeof parsed.warmedAt !== 'number') return false;
    return Date.now() - parsed.warmedAt < warmupStampMaxAgeMs;
  } catch {
    return false;
  }
}

function writeWarmupStamp(baseURL: string) {
  mkdirSync(warmupCacheDir, { recursive: true });
  writeFileSync(
    warmupStampPath,
    JSON.stringify({ baseURL, warmedAt: Date.now() }, null, 2)
  );
}

async function globalSetup() {
  const startTime = Date.now();
  console.log('Starting E2E global setup...');
  if (isAuthRefreshOnly) {
    console.log('  Running auth-refresh-only setup');
  }

  console.log('  Env files loaded:');
  console.log(
    `    .env.development.local: ${process.env.E2E_CLERK_USER_USERNAME ? 'yes (has E2E creds)' : 'no creds found'}`
  );
  console.log(
    `    .env.local: ${process.env.CLERK_SECRET_KEY ? 'yes (has Clerk keys)' : 'no Clerk keys found'}`
  );

  const secretKey = process.env.CLERK_SECRET_KEY;
  const publishableKey =
    process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY ??
    process.env.CLERK_PUBLISHABLE_KEY;
  const hasRealClerkKeys = isRealKey(secretKey) && isRealKey(publishableKey);

  const testUsername = process.env.E2E_CLERK_USER_USERNAME ?? '';
  const hasTestUser =
    testUsername.length > 0 &&
    (testUsername.includes('+clerk_test') ||
      !!process.env.E2E_CLERK_USER_PASSWORD);

  if (hasRealClerkKeys) {
    try {
      await clerkSetup({
        publishableKey: publishableKey!,
        secretKey: secretKey!,
      });
      process.env.CLERK_TESTING_SETUP_SUCCESS = 'true';
      console.log('Clerk testing token set up successfully');
    } catch (error) {
      console.warn('Failed to set up Clerk testing token');
      if (process.env.NODE_ENV === 'development') {
        console.warn(
          'Error details:',
          error instanceof Error ? error.message : String(error)
        );
      }
      console.log('  Tests will run without Clerk authentication');
    }
  } else {
    console.log('Using mock Clerk keys for testing');
  }

  if (hasTestUser) {
    console.log('E2E test user is configured');
  } else if (hasRealClerkKeys) {
    console.log('Clerk keys found but no test user configured');
    console.log(
      '  Set E2E_CLERK_USER_USERNAME and E2E_CLERK_USER_PASSWORD for authenticated tests'
    );
  }

  if (isCI && process.env.BASE_URL) {
    console.log(`CI mode with external BASE_URL: ${process.env.BASE_URL}`);
    console.log('  Skipping local env overrides and warmup');
    return;
  }

  Object.assign(process.env, {
    NODE_ENV: process.env.NODE_ENV || 'test',
    NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY:
      process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY ||
      'pk_test_mock-key-for-testing',
    NEXT_PUBLIC_CLERK_PRICING_TABLE_ID:
      process.env.NEXT_PUBLIC_CLERK_PRICING_TABLE_ID || 'prctbl_dummy',
    CLERK_SECRET_KEY:
      process.env.CLERK_SECRET_KEY || 'sk_test_mock-key-for-testing',
    E2E_CLERK_USER_USERNAME: process.env.E2E_CLERK_USER_USERNAME || '',
    E2E_CLERK_USER_PASSWORD: process.env.E2E_CLERK_USER_PASSWORD || '',
    NEXT_PUBLIC_APP_URL:
      process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3100',
  });

  if (shouldSkipSeeding) {
    console.log('Skipping test data seeding for fast local iteration');
  } else if (process.env.DATABASE_URL) {
    try {
      console.log('Seeding test data...');
      await seedTestData({ publicProfilesOnly: isPublicNoAuthOnly });
      console.log('Test data seeded successfully');
    } catch (error) {
      console.warn('Failed to seed test data:', error);
      console.log('  Tests may fail if required profiles are missing');
      if (isCI && isSmokeOnly) {
        console.error('Seeding is required for smoke tests in CI');
        throw error;
      }
    }
  } else {
    console.log('DATABASE_URL not set, skipping test data seeding');
  }

  if (shouldSkipWarmup) {
    console.log('Skipping route warmup for fast local iteration');
  } else {
    const baseURL = process.env.BASE_URL || 'http://localhost:3100';
    const canReuseWarmup =
      isFastIteration && !isPublicNoAuthOnly && hasFreshWarmupStamp(baseURL);

    if (canReuseWarmup) {
      console.log('Skipping route warmup because hot-server warmup is fresh');
      const elapsed = Date.now() - startTime;
      console.log(`E2E global setup complete in ${elapsed}ms`);
      return;
    }

    console.log('Warming up Turbopack routes...');
    const testProfile = process.env.E2E_TEST_PROFILE || 'dualipa';
    const warmupRoutes = isPublicNoAuthOnly
      ? isFastIteration
        ? ['/', `/${testProfile}`]
        : [
            '/',
            '/api/stripe/pricing-options',
            `/${testProfile}`,
            `/${testProfile}?mode=listen`,
            `/${testProfile}?mode=subscribe`,
            '/testartist?mode=tip',
            '/signin',
            '/signup',
            '/nonexistent-handle-xyz-123',
          ]
      : isFastIteration
        ? useStoredAuth && hasStoredAuthState
          ? [APP_ROUTES.AUDIENCE, APP_ROUTES.RELEASES]
          : ['/signin', APP_ROUTES.AUDIENCE, APP_ROUTES.RELEASES]
        : [
            '/',
            '/api/stripe/pricing-options',
            '/signin',
            APP_ROUTES.DASHBOARD,
            APP_ROUTES.CHAT,
            APP_ROUTES.DASHBOARD_PROFILE,
            `/${testProfile}`,
            `/${testProfile}?mode=listen`,
            `/${testProfile}?mode=subscribe`,
            `/${testProfile}?mode=tip`,
            '/testartist?mode=tip',
            APP_ROUTES.ADMIN,
            APP_ROUTES.ADMIN_CREATORS,
            APP_ROUTES.ADMIN_USERS,
          ];

    for (const route of warmupRoutes) {
      try {
        const res = await fetch(`${baseURL}${route}`, {
          signal: AbortSignal.timeout(120_000),
          redirect: 'follow',
        });
        console.log(`  ${route} (${res.status}) warmed up`);
      } catch {
        console.log(
          `  ${route} warmup failed (will compile on first test visit)`
        );
      }
    }

    if (isFastIteration) {
      try {
        const wrapLinkResponse = await fetch(`${baseURL}/api/wrap-link`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-forwarded-for': WRAP_LINK_WARMUP_IP,
          },
          body: JSON.stringify({
            url: 'https://spotify.com/track/e2e-warmup',
            platform: 'spotify',
          }),
          signal: AbortSignal.timeout(120_000),
        });
        console.log(`  /api/wrap-link (${wrapLinkResponse.status}) warmed up`);

        if (wrapLinkResponse.ok) {
          const wrappedLink = (await wrapLinkResponse.json()) as {
            shortId?: string;
          };

          if (wrappedLink.shortId) {
            let challengeToken: string | null = null;

            for (const route of [`/go/${wrappedLink.shortId}`]) {
              try {
                const res = await fetch(`${baseURL}${route}`, {
                  signal: AbortSignal.timeout(120_000),
                  redirect: 'manual',
                });
                console.log(`  ${route} (${res.status}) warmed up`);
              } catch {
                console.log(
                  `  ${route} warmup failed (will compile on first test visit)`
                );
              }
            }

            try {
              const outResponse = await fetch(
                `${baseURL}/out/${wrappedLink.shortId}`,
                {
                  signal: AbortSignal.timeout(120_000),
                  redirect: 'manual',
                }
              );
              console.log(
                `  /out/${wrappedLink.shortId} (${outResponse.status}) warmed up`
              );
              challengeToken = extractChallengeToken(await outResponse.text());
            } catch {
              console.log(
                `  /out/${wrappedLink.shortId} warmup failed (will compile on first test visit)`
              );
            }

            if (challengeToken) {
              try {
                const linkApiResponse = await fetch(
                  `${baseURL}/api/link/${wrappedLink.shortId}`,
                  {
                    method: 'POST',
                    headers: {
                      'Content-Type': 'application/json',
                      'User-Agent':
                        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                      'x-forwarded-for': WRAP_LINK_WARMUP_IP,
                    },
                    body: JSON.stringify({
                      challengeToken,
                      timestamp: Date.now(),
                    }),
                    signal: AbortSignal.timeout(120_000),
                  }
                );
                console.log(
                  `  /api/link/${wrappedLink.shortId} (${linkApiResponse.status}) warmed up`
                );
              } catch {
                console.log(
                  `  /api/link/${wrappedLink.shortId} warmup failed (will compile on first test visit)`
                );
              }
            }
          }
        }
      } catch {
        console.log(
          '  /api/wrap-link warmup failed (will compile on first anti-cloaking request)'
        );
      }
    }

    if (isFastIteration && !isPublicNoAuthOnly) {
      writeWarmupStamp(baseURL);
    }
  }

  const elapsed = Date.now() - startTime;
  console.log(`E2E global setup complete in ${elapsed}ms`);
}

export default globalSetup;
