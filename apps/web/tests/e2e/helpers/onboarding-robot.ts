import { createClerkClient } from '@clerk/backend';
import { neon } from '@neondatabase/serverless';
import { expect, type Page } from '@playwright/test';
import { APP_ROUTES } from '@/constants/routes';
import {
  ONBOARDING_FUNNEL_EVENTS,
  type OnboardingFunnelEvent,
} from '@/lib/onboarding/funnel-events';
import {
  waitForAuthenticatedHealth,
  waitForClerkSignInApi,
} from '@/tests/helpers/clerk-auth';
import {
  type OnboardingRobotEnv,
  onboardingRobotEnv,
} from '../utils/onboarding-robot-env';
import {
  buildProductionSignupEmail,
  isProductionSyntheticSignupEmail,
} from '../utils/production-signup-canary';
import { createFreshUser } from './e2e-helpers';

export interface OnboardingRobotUser {
  readonly authStrategy: 'clerk_sign_in_token' | 'clerk_testing_session';
  readonly clerkUserId: string;
  readonly email: string;
  readonly handle?: string;
  readonly runId: string;
}

export interface CapturedOnboardingRobotEvent {
  readonly event: string;
  readonly properties: Record<string, unknown>;
  readonly timestamp: number;
}

export interface OnboardingRobotState {
  readonly events: CapturedOnboardingRobotEvent[];
  readonly url: string;
}

type CleanupTarget = Pick<
  OnboardingRobotUser,
  'clerkUserId' | 'email' | 'handle' | 'runId'
>;

type CleanupEnv = Pick<OnboardingRobotEnv, 'E2E_PROD_SIGNUP_EMAIL_BASE'>;

type RobotRuntimeEnv = Pick<
  OnboardingRobotEnv,
  | 'CLERK_SECRET_KEY'
  | 'DATABASE_URL'
  | 'E2E_PROD_SIGNUP_EMAIL_BASE'
  | 'E2E_SYNTHETIC_MODE'
>;

const runtimeEnv: RobotRuntimeEnv = onboardingRobotEnv;

const LOCAL_ROBOT_EMAIL_REGEX =
  /^gp-or-[a-z0-9-]+\+clerk_test@test\.jovie\.com$/;
const SIGN_IN_TOKEN_TTL_SECONDS = 60;

function normalizeRobotToken(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-{2,}/g, '-');
}

export function buildOnboardingRobotRunId(seed = `${Date.now().toString(36)}`) {
  const normalized = normalizeRobotToken(seed);
  const withoutPrefix = normalized.replace(/^or-/, '');
  return `or-${withoutPrefix || 'run'}`.slice(0, 48);
}

export function buildOnboardingRobotHandle(
  runId: string,
  clerkUserId: string
): string {
  const runFragment = normalizeRobotToken(runId)
    .replace(/^or-/, '')
    .replace(/-/g, '')
    .slice(0, 16);
  const userFragment = clerkUserId
    .replace(/[^a-z0-9]/gi, '')
    .toLowerCase()
    .slice(-8);

  return `jor${runFragment}${userFragment || 'user'}`.slice(0, 30);
}

export function isLocalOnboardingRobotEmail(email: string): boolean {
  return LOCAL_ROBOT_EMAIL_REGEX.test(email);
}

export function isProductionOnboardingRobotEmail(
  email: string,
  baseEmail: string | undefined
): boolean {
  return Boolean(
    baseEmail &&
      email.includes('+onboarding-robot-or-') &&
      isProductionSyntheticSignupEmail(email, baseEmail)
  );
}

export function assertOnboardingRobotCleanupTarget(
  target: CleanupTarget,
  env: CleanupEnv = runtimeEnv
): void {
  const emailIsScoped =
    isLocalOnboardingRobotEmail(target.email) ||
    isProductionOnboardingRobotEmail(
      target.email,
      env.E2E_PROD_SIGNUP_EMAIL_BASE
    );

  if (!emailIsScoped) {
    throw new Error(
      `Refusing to clean up non-robot onboarding email: ${target.email}`
    );
  }

  if (!target.runId.startsWith('or-')) {
    throw new Error(`Refusing cleanup for non-robot run id: ${target.runId}`);
  }

  if (!target.clerkUserId.startsWith('user_')) {
    throw new Error(
      `Refusing cleanup for non-Clerk user id: ${target.clerkUserId}`
    );
  }

  if (target.handle && !/^jor[a-z0-9]{4,27}$/.test(target.handle)) {
    throw new Error(
      `Refusing cleanup for non-robot onboarding handle: ${target.handle}`
    );
  }
}

export function shouldUseProductionRobotAuth(): boolean {
  return (
    runtimeEnv.E2E_SYNTHETIC_MODE === 'true' &&
    Boolean(runtimeEnv.E2E_PROD_SIGNUP_EMAIL_BASE?.trim())
  );
}

function requireClerkSecret(): string {
  const secretKey = runtimeEnv.CLERK_SECRET_KEY?.trim();
  if (!secretKey) {
    throw new Error('CLERK_SECRET_KEY required for onboarding robot user');
  }
  return secretKey;
}

async function createProductionOnboardingRobotUser(
  runId: string
): Promise<OnboardingRobotUser> {
  const baseEmail = runtimeEnv.E2E_PROD_SIGNUP_EMAIL_BASE?.trim();
  if (!baseEmail) {
    throw new Error(
      'E2E_PROD_SIGNUP_EMAIL_BASE required for production onboarding robot'
    );
  }

  const email = buildProductionSignupEmail(
    baseEmail,
    `onboarding-robot-${runId}`
  );
  const clerk = createClerkClient({ secretKey: requireClerkSecret() });
  const existingUsers = await clerk.users.getUserList({
    emailAddress: [email],
  });
  const existingUser = existingUsers.data[0];
  const metadata = {
    role: 'synthetic_onboarding_robot',
    syntheticRunId: runId,
  };

  if (existingUser) {
    await clerk.users.updateUserMetadata(existingUser.id, {
      publicMetadata: {
        ...(existingUser.publicMetadata ?? {}),
        ...metadata,
      },
    });
    return {
      authStrategy: 'clerk_sign_in_token',
      clerkUserId: existingUser.id,
      email,
      runId,
    };
  }

  const createdUser = await clerk.users.createUser({
    emailAddress: [email],
    firstName: 'Onboarding',
    lastName: 'Robot',
    publicMetadata: metadata,
    skipPasswordRequirement: true,
  });

  return {
    authStrategy: 'clerk_sign_in_token',
    clerkUserId: createdUser.id,
    email,
    runId,
  };
}

export async function createOnboardingRobotUser(
  page: Page,
  runId = buildOnboardingRobotRunId()
): Promise<OnboardingRobotUser> {
  if (shouldUseProductionRobotAuth()) {
    return createProductionOnboardingRobotUser(runId);
  }

  const user = await createFreshUser(page, runId);
  return {
    authStrategy: 'clerk_testing_session',
    clerkUserId: user.clerkUserId,
    email: user.email,
    runId,
  };
}

async function createClerkSignInTicket(clerkUserId: string): Promise<string> {
  const clerk = createClerkClient({ secretKey: requireClerkSecret() });
  const signInToken = await clerk.signInTokens.createSignInToken({
    userId: clerkUserId,
    expiresInSeconds: SIGN_IN_TOKEN_TTL_SECONDS,
  });
  return signInToken.token;
}

export async function emitSyntheticOnboardingRobotEvent(
  page: Page,
  event: OnboardingFunnelEvent
): Promise<void> {
  await page.evaluate(eventName => {
    const analyticsWindow = window as Window & {
      gtag?: (
        command: string,
        event: string,
        properties?: Record<string, unknown>
      ) => void;
    };

    analyticsWindow.gtag?.('event', eventName, {
      source: 'onboarding_robot',
      synthetic: true,
    });
  }, event);
}

export async function authenticateOnboardingRobotUser(
  page: Page,
  user: OnboardingRobotUser
): Promise<void> {
  if (user.authStrategy === 'clerk_sign_in_token') {
    const ticket = await createClerkSignInTicket(user.clerkUserId);

    await page.goto(APP_ROUTES.SIGNIN, {
      waitUntil: 'domcontentloaded',
      timeout: 120_000,
    });

    const loaded = await waitForClerkSignInApi(page);
    if (!loaded) {
      throw new Error('Clerk sign-in API never became ready for robot auth');
    }

    const activatedUserId = await page.evaluate(async signInTicket => {
      const clerkInstance = (
        window as Window & {
          Clerk?: {
            client?: {
              signIn?: {
                createdSessionId?: string | null;
                ticket?: (params: { ticket: string }) => Promise<{
                  error?: unknown;
                }>;
                finalize?: () => Promise<{ error?: unknown }>;
              };
            };
            setActive?: (params: { session: string }) => Promise<void>;
            user?: { id?: string | null } | null;
          };
        }
      ).Clerk;

      const signIn = clerkInstance?.client?.signIn;
      if (!signIn?.ticket || !signIn.finalize || !clerkInstance?.setActive) {
        throw new Error('Clerk ticket sign-in API not initialized');
      }

      const ticketAttempt = await signIn.ticket({ ticket: signInTicket });
      if (ticketAttempt.error) {
        throw new Error('Clerk ticket sign-in failed');
      }

      const finalizeAttempt = await signIn.finalize();
      if (finalizeAttempt.error) {
        throw new Error('Clerk ticket finalize failed');
      }

      const sessionId = signIn.createdSessionId;
      if (!sessionId) {
        throw new Error('Clerk ticket sign-in did not create a session');
      }

      await clerkInstance.setActive({ session: sessionId });
      return clerkInstance.user?.id ?? null;
    }, ticket);

    if (activatedUserId !== user.clerkUserId) {
      throw new Error(
        `Robot auth activated ${activatedUserId ?? 'unknown'} instead of ${user.clerkUserId}`
      );
    }
  }

  await waitForAuthenticatedHealth(page, user.clerkUserId);
  await emitSyntheticOnboardingRobotEvent(
    page,
    ONBOARDING_FUNNEL_EVENTS.AUTH_COMPLETED
  );
}

export async function cleanupOnboardingRobotUser(
  user: OnboardingRobotUser
): Promise<void> {
  assertOnboardingRobotCleanupTarget(user);

  const dbUrl = runtimeEnv.DATABASE_URL?.trim();
  if (dbUrl) {
    const sql = neon(dbUrl);
    const targetUsers = await sql`
      SELECT id
      FROM users
      WHERE clerk_id = ${user.clerkUserId}
        AND email = ${user.email}
      LIMIT 1
    `;
    const targetUserId = targetUsers[0]?.id as string | undefined;

    if (targetUserId) {
      await sql`
        UPDATE users
        SET active_profile_id = NULL, updated_at = NOW()
        WHERE id = ${targetUserId}
      `;

      if (user.handle) {
        await sql`
          DELETE FROM user_profile_claims
          WHERE user_id = ${targetUserId}
             OR creator_profile_id IN (
               SELECT id
               FROM creator_profiles
               WHERE username_normalized = ${user.handle}
                 AND user_id = ${targetUserId}
             )
        `;

        await sql`
          DELETE FROM creator_profiles
          WHERE username_normalized = ${user.handle}
            AND user_id = ${targetUserId}
        `;
      }

      await sql`
        DELETE FROM users
        WHERE id = ${targetUserId}
          AND clerk_id = ${user.clerkUserId}
          AND email = ${user.email}
      `;
    }
  }

  const secretKey = runtimeEnv.CLERK_SECRET_KEY?.trim();
  if (
    secretKey &&
    !secretKey.toLowerCase().includes('mock') &&
    !secretKey.toLowerCase().includes('dummy')
  ) {
    const clerk = createClerkClient({ secretKey });
    await clerk.users.deleteUser(user.clerkUserId).catch(error => {
      const status = (error as { status?: unknown; statusCode?: unknown })
        .status;
      const statusCode = (error as { status?: unknown; statusCode?: unknown })
        .statusCode;
      if (status === 404 || statusCode === 404) return;
      throw error;
    });
  }
}

export async function installOnboardingAnalyticsCapture(page: Page) {
  await page.addInitScript(() => {
    const analyticsWindow = window as Window & {
      __jovieOnboardingRobotEvents?: CapturedOnboardingRobotEvent[];
      gtag?: (...args: unknown[]) => unknown;
    };
    const storageKey = 'jovie:onboarding-robot-events';
    const readStoredEvents = (): CapturedOnboardingRobotEvent[] => {
      try {
        const raw = window.sessionStorage.getItem(storageKey);
        const parsed = raw ? JSON.parse(raw) : [];
        return Array.isArray(parsed) ? parsed : [];
      } catch {
        return [];
      }
    };
    const events: CapturedOnboardingRobotEvent[] = readStoredEvents();
    const persistEvents = () => {
      try {
        window.sessionStorage.setItem(storageKey, JSON.stringify(events));
      } catch {
        // Event capture must never affect the route under test.
      }
    };
    let delegatedGtag =
      typeof analyticsWindow.gtag === 'function'
        ? analyticsWindow.gtag
        : undefined;

    analyticsWindow.__jovieOnboardingRobotEvents = events;

    Object.defineProperty(analyticsWindow, 'gtag', {
      configurable: true,
      get() {
        return (...args: unknown[]) => {
          const [command, event, properties] = args;
          if (command === 'event' && typeof event === 'string') {
            events.push({
              event,
              properties:
                typeof properties === 'object' &&
                properties !== null &&
                !Array.isArray(properties)
                  ? (properties as Record<string, unknown>)
                  : {},
              timestamp: Date.now(),
            });
            persistEvents();
          }

          return delegatedGtag?.(...args);
        };
      },
      set(nextGtag: unknown) {
        delegatedGtag =
          typeof nextGtag === 'function'
            ? (nextGtag as (...args: unknown[]) => unknown)
            : undefined;
      },
    });
  });
}

export async function readOnboardingRobotState(
  page: Page
): Promise<OnboardingRobotState> {
  return page.evaluate(() => {
    const analyticsWindow = window as Window & {
      __jovieOnboardingRobotEvents?: CapturedOnboardingRobotEvent[];
    };

    return {
      events: analyticsWindow.__jovieOnboardingRobotEvents ?? [],
      url: window.location.href,
    };
  });
}

export async function waitForOnboardingRobotEvents(
  page: Page,
  expectedEvents: readonly OnboardingFunnelEvent[],
  timeout = 30_000
): Promise<void> {
  await expect
    .poll(
      async () => {
        const state = await readOnboardingRobotState(page);
        return Array.from(new Set(state.events.map(entry => entry.event)));
      },
      { timeout }
    )
    .toEqual(expect.arrayContaining([...expectedEvents]));
}

type StreamChunk = Record<string, unknown>;

function uiStreamBody(chunks: readonly StreamChunk[]) {
  return `${chunks.map(chunk => `data: ${JSON.stringify(chunk)}\n\n`).join('')}data: [DONE]\n\n`;
}

export async function mockOnboardingRobotStartChat(page: Page) {
  await page.route('**/api/chat', async route => {
    const body = route.request().postDataJSON() as {
      readonly messages?: unknown[];
      readonly mode?: string;
    };

    expect(body.mode).toBe('onboarding');
    expect(Array.isArray(body.messages)).toBe(true);

    await route.fulfill({
      status: 200,
      headers: {
        'cache-control': 'no-cache',
        'content-type': 'text/event-stream; charset=utf-8',
        'set-cookie':
          'jovie_onboarding_session=onboarding-robot-session; Path=/; HttpOnly; SameSite=Lax',
      },
      body: uiStreamBody([
        { type: 'start', messageId: 'assistant-onboarding-robot' },
        { type: 'start-step' },
        { type: 'text-start', id: 'assistant-onboarding-robot-text' },
        {
          type: 'text-delta',
          id: 'assistant-onboarding-robot-text',
          delta:
            'I found enough signal to keep going. Create your account and I will attach this setup chat.',
        },
        { type: 'text-end', id: 'assistant-onboarding-robot-text' },
        {
          type: 'tool-input-available',
          toolName: 'proposeNextStep',
          toolCallId: 'tool-next-step',
          input: { summary: 'Synthetic onboarding robot qualification' },
        },
        {
          type: 'tool-output-available',
          toolCallId: 'tool-next-step',
          output: {
            action: 'propose_next_step',
            decision: {
              kind: 'instant_access',
              rationale: 'Synthetic robot has deterministic positive signal.',
              score: 100,
            },
          },
        },
        { type: 'finish-step' },
        { type: 'finish', finishReason: 'stop' },
      ]),
    });
  });
}
