/**
 * Default JOV-9760 claim+cleanup walker for agent-path:cert.
 *
 * Reuses the Golden Path claim-walk canary (JOV-9826): reset → Better Auth
 * OTP sign-in → claimAgentDraft (same domain as /claim/agent) → reset.
 * Requires CRON_SECRET, SYNTHETIC_PASSAGE_KEY, and DATABASE_URL (OTP + claim).
 *
 * Production invoke (names only; Tim / symphony on `Production – jovie`):
 *
 *   doppler run --project jovie-web --config prd \
 *     --only-secrets=CRON_SECRET,DATABASE_URL --no-fallback -- \
 *     env -u DOPPLER_TOKEN bash -lc '
 *       export GITHUB_ENV=$(mktemp)
 *       node scripts/synthetic-passage-key.mjs
 *       set -a; . "$GITHUB_ENV"; set +a
 *       pnpm --filter @jovie/web agent-path:cert -- --base https://jov.ie \
 *         --out agent-path-cert.json
 *     '
 */
import { Buffer } from 'node:buffer';
import type { AgentClaimResult } from '@/lib/agent-acquisition/draft-claim.server';
import { mintPassageToken } from '@/lib/synthetic/passage-token';
import {
  PRODCERT_CLAIM_CANARY_EMAIL,
  PRODCERT_CLAIM_CANARY_HANDLE,
} from '@/lib/synthetic/prodcert-identities';
import { waitForProductionAuthOtp } from '@/lib/synthetic/production-auth-otp';
import type { ClaimOutcomeContext } from './cert-outcomes';
import { missingClaimOutcomeEnv } from './cert-outcomes';

const HTTP_TIMEOUT_MS = 30_000;

export type ClaimWalkResult = {
  readonly claimPersisted: boolean;
  readonly fixturesCleaned: boolean;
  readonly detail?: unknown;
};

export type ClaimWalkFn = (
  ctx: Pick<ClaimOutcomeContext, 'origin' | 'run' | 'draftId' | 'claimUrl'> & {
    readonly draftId: string;
    readonly claimUrl: string;
  }
) => Promise<ClaimWalkResult>;

export interface CanaryClaimWalkDeps {
  readonly env?: Readonly<Record<string, string | undefined>>;
  readonly fetchImpl?: typeof fetch;
  readonly waitForOtp?: typeof waitForProductionAuthOtp;
  readonly claimDraft?: (input: {
    readonly draftId: string;
    readonly handoff: string;
    readonly userId: string;
  }) => Promise<AgentClaimResult>;
  readonly nowMs?: () => number;
}

function mergeCookies(existing: string, setCookie: string | null): string {
  if (!setCookie) return existing;
  const jar = new Map<string, string>();
  for (const part of existing.split(';')) {
    const trimmed = part.trim();
    if (!trimmed) continue;
    const eq = trimmed.indexOf('=');
    if (eq > 0) jar.set(trimmed.slice(0, eq), trimmed.slice(eq + 1));
  }
  // fetch may join multiple Set-Cookie with comma; split carefully on ", <name>="
  for (const raw of setCookie.split(/,(?=\s*[^;=]+=)/)) {
    const pair = raw.split(';', 1)[0]?.trim();
    if (!pair) continue;
    const eq = pair.indexOf('=');
    if (eq > 0) jar.set(pair.slice(0, eq), pair.slice(eq + 1));
  }
  return [...jar.entries()].map(([k, v]) => `${k}=${v}`).join('; ');
}

function parseClaimUrl(claimUrl: string): {
  draftId: string;
  handoff: string;
} {
  const url = new URL(claimUrl);
  const parts = url.pathname.split('/').filter(Boolean);
  const draftId = parts[parts.length - 1] ?? '';
  const handoff = url.searchParams.get('h') ?? '';
  if (!/^[0-9a-f-]{36}$/i.test(draftId) || !/^[A-Za-z0-9_-]{43}$/.test(handoff))
    throw new Error('claim_url missing draft id or handoff token');
  return { draftId, handoff };
}

async function postCanaryReset(
  fetchImpl: typeof fetch,
  origin: string,
  runTag: string,
  cronSecret: string,
  passageKey: string
): Promise<void> {
  const token = mintPassageToken(Buffer.from(passageKey, 'base64url'), {
    sub: PRODCERT_CLAIM_CANARY_EMAIL,
    scp: 'canary_reset',
    run: runTag.slice(0, 64),
    ttlSeconds: 300,
  });
  const response = await fetchImpl(`${origin}/api/internal/canary/reset`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${cronSecret}`,
      'x-jovie-synthetic-passage': token,
    },
    signal: AbortSignal.timeout(HTTP_TIMEOUT_MS),
  });
  if (response.status !== 200) {
    throw new Error(
      `canary reset HTTP ${response.status}: ${(await response.text()).slice(0, 300)}`
    );
  }
}

async function defaultClaimDraft(input: {
  readonly draftId: string;
  readonly handoff: string;
  readonly userId: string;
}): Promise<AgentClaimResult> {
  const { loadAgentClaimView, claimAgentDraft } = await import(
    '@/lib/agent-acquisition/draft-claim.server'
  );
  const view = await loadAgentClaimView(
    input.draftId,
    input.handoff,
    input.userId
  );
  if (view.state === 'claimed' && view.ownedByViewer)
    return {
      status: 'claimed',
      handle: view.handle ?? PRODCERT_CLAIM_CANARY_HANDLE,
    };
  if (view.state !== 'ready')
    return {
      status: view.state === 'claimed' ? 'already_claimed' : view.state,
    };
  return claimAgentDraft(
    input.draftId,
    input.handoff,
    input.userId,
    view.preview.digest
  );
}

/**
 * Build the default canary claim walker. Call only when claim-walk env is
 * present (or inject mocks in tests).
 */
export function createCanaryClaimWalk(
  deps: CanaryClaimWalkDeps = {}
): ClaimWalkFn {
  const fetchImpl = deps.fetchImpl ?? fetch;
  const waitForOtp = deps.waitForOtp ?? waitForProductionAuthOtp;
  const claimDraft = deps.claimDraft ?? defaultClaimDraft;
  const nowMs = deps.nowMs ?? Date.now;

  return async ctx => {
    const env = deps.env ?? process.env;
    const missing = missingClaimOutcomeEnv(env);
    if (missing.length > 0) {
      throw new Error(
        `claim walk requires ${missing.join(', ')}; refuse to run unwired`
      );
    }
    const cronSecretRaw = env.CRON_SECRET;
    const passageKeyRaw = env.SYNTHETIC_PASSAGE_KEY;
    // missingClaimOutcomeEnv already required non-empty; re-check for narrowing.
    if (!cronSecretRaw || !passageKeyRaw) {
      throw new Error(
        'claim walk requires CRON_SECRET, SYNTHETIC_PASSAGE_KEY; refuse to run unwired'
      );
    }
    const cronSecret = cronSecretRaw.trim();
    const passageKey = passageKeyRaw.trim();
    const { draftId, handoff } = parseClaimUrl(ctx.claimUrl);
    if (draftId !== ctx.draftId)
      throw new Error('draftId does not match claim_url path');

    const runTag = `agent-path-${ctx.run}`.slice(0, 64);
    await postCanaryReset(
      fetchImpl,
      ctx.origin,
      runTag,
      cronSecret,
      passageKey
    );

    let fixturesCleaned = false;
    try {
      const email = PRODCERT_CLAIM_CANARY_EMAIL;
      const startedAtMs = nowMs();
      const send = await fetchImpl(
        new URL('/api/auth/email-otp/send-verification-otp', ctx.origin),
        {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            origin: ctx.origin,
          },
          body: JSON.stringify({ email, type: 'sign-in' }),
          signal: AbortSignal.timeout(HTTP_TIMEOUT_MS),
        }
      );
      if (!send.ok)
        throw new Error(
          `OTP send HTTP ${send.status}: ${(await send.text()).slice(0, 200)}`
        );

      const otp = await waitForOtp({
        email,
        startedAtMs,
        environment: env,
      });

      let cookie = '';
      const signIn = await fetchImpl(
        new URL('/api/auth/sign-in/email-otp', ctx.origin),
        {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            origin: ctx.origin,
          },
          body: JSON.stringify({ email, otp }),
          signal: AbortSignal.timeout(HTTP_TIMEOUT_MS),
        }
      );
      cookie = mergeCookies(cookie, signIn.headers.get('set-cookie'));
      if (!signIn.ok)
        throw new Error(
          `OTP sign-in HTTP ${signIn.status}: ${(await signIn.text()).slice(0, 200)}`
        );

      const sessionRes = await fetchImpl(
        new URL('/api/auth/get-session', ctx.origin),
        {
          headers: { cookie, origin: ctx.origin },
          signal: AbortSignal.timeout(HTTP_TIMEOUT_MS),
        }
      );
      cookie = mergeCookies(cookie, sessionRes.headers.get('set-cookie'));
      const sessionJson = (await sessionRes.json()) as {
        user?: { id?: string };
      };
      const userId = sessionJson.user?.id;
      if (!userId) throw new Error('get-session returned no user id after OTP');

      const result = await claimDraft({ draftId, handoff, userId });
      const claimPersisted =
        result.status === 'claimed' ||
        (result.status === 'existing_profile' &&
          'handle' in result &&
          Boolean(result.handle));

      await postCanaryReset(
        fetchImpl,
        ctx.origin,
        `${runTag}-cleanup`.slice(0, 64),
        cronSecret,
        passageKey
      );
      fixturesCleaned = true;

      return {
        claimPersisted,
        fixturesCleaned,
        detail: {
          gate: 'canary-claim-walk',
          result,
          handle: PRODCERT_CLAIM_CANARY_HANDLE,
          email,
        },
      };
    } catch (error) {
      try {
        await postCanaryReset(
          fetchImpl,
          ctx.origin,
          `${runTag}-abort`.slice(0, 64),
          cronSecret,
          passageKey
        );
      } catch {
        // Prefer the original claim error; cleanup failure is secondary.
      }
      throw error;
    }
  };
}

/** True when runCert should inject the default canary walk. */
export function shouldInjectCanaryClaimWalk(
  env: Readonly<Record<string, string | undefined>>,
  walk: ClaimWalkFn | undefined
): boolean {
  return !walk && missingClaimOutcomeEnv(env).length === 0;
}
