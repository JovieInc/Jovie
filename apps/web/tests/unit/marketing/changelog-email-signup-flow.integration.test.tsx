/**
 * Connected regression flow for the changelog email signup (JOV-7494).
 *
 * Unlike the isolated suites (component tests stub fetch/Turnstile; API tests
 * stub the db and the mail provider), this file wires the REAL component to
 * the REAL subscribe/verify route handlers, backed by an in-memory subscriber
 * store and a captured mail sink. The only seams are:
 *
 *  - the component's `fetch` call is intercepted and forwarded to the real
 *    `POST /api/changelog/subscribe` handler,
 *  - the drizzle `db` is an in-memory fake interpreting the same operator
 *    conditions the routes build (eq/and/lte/isNull/gt),
 *  - `sendEmail` is replaced by a sink that records every send — no real
 *    provider is constructed and no outbound mail can leave the test.
 *
 * The mail sink IS the controlled mailbox for this suite: every recipient is
 * a controlled @example.com address, and the assertions pin the exact set of
 * sends. Simulated mail evidence only — real controlled delivery verification
 * is tracked separately by the issue.
 */

import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import { useEffect } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ChangelogEmailSignup } from '@/app/(marketing)/changelog/ChangelogEmailSignup';
import { POST as subscribePost } from '@/app/api/changelog/subscribe/route';
import { GET as verifyGet } from '@/app/api/changelog/verify/route';

const turnstileMock = vi.hoisted(() => ({
  provideToken: true,
  unmountCount: 0,
  resetSignal: 0,
  onToken: null as ((token: string) => void) | null,
  onStateChange: null as
    | ((state: {
        readonly status: 'verified' | 'error' | 'interactive';
        readonly message?: string;
      }) => void)
    | null,
}));

vi.mock('@/components/atoms/InvisibleTurnstile', () => ({
  InvisibleTurnstile: ({
    onToken,
    onStateChange,
    resetSignal,
  }: {
    readonly onToken: (token: string) => void;
    readonly resetSignal?: number;
    readonly onStateChange?: (state: {
      readonly status: 'verified' | 'error' | 'interactive';
      readonly message?: string;
    }) => void;
  }) => {
    turnstileMock.resetSignal = resetSignal ?? 0;
    useEffect(() => {
      turnstileMock.onToken = onToken;
      turnstileMock.onStateChange = onStateChange ?? null;
      onToken('test-turnstile-token');
      onStateChange?.({ status: 'verified' });
      return () => {
        turnstileMock.onToken = null;
        turnstileMock.onStateChange = null;
      };
    }, [onStateChange, onToken]);
    useEffect(() => {
      if ((resetSignal ?? 0) > 0 && turnstileMock.provideToken) {
        onToken('test-turnstile-token');
      }
    }, [resetSignal, onToken]);
    return null;
  },
  isTurnstileClientBypassed: () => false,
  isTurnstileClientConfigured: () => true,
}));

vi.mock('@/lib/hooks/useReducedMotion', () => ({
  useReducedMotion: () => true,
}));

vi.mock('drizzle-orm', () => ({
  eq: (col: string, val: unknown) => ({ op: 'eq', col, val }),
  and: (...children: unknown[]) => ({ op: 'and', children }),
  lte: (col: string, val: unknown) => ({ op: 'lte', col, val }),
  isNull: (col: string) => ({ op: 'isNull', col }),
  gt: (col: string, val: unknown) => ({ op: 'gt', col, val }),
}));

const store = vi.hoisted(() => ({
  rows: [] as Array<Record<string, unknown>>,
}));

const dbFake = vi.hoisted(() => {
  type Condition = {
    op?: string;
    col?: string;
    val?: unknown;
    children?: Condition[];
  };
  const matchCondition = (
    condition: Condition,
    row: Record<string, unknown>
  ): boolean => {
    if (!condition || typeof condition !== 'object') return false;
    switch (condition.op) {
      case 'eq':
        return row[condition.col as string] === condition.val;
      case 'and':
        return (condition.children ?? []).every(child =>
          matchCondition(child, row)
        );
      case 'lte': {
        const cell = row[condition.col as string];
        return (
          cell instanceof Date &&
          condition.val instanceof Date &&
          cell.getTime() <= condition.val.getTime()
        );
      }
      case 'gt': {
        const cell = row[condition.col as string];
        return (
          cell instanceof Date &&
          condition.val instanceof Date &&
          cell.getTime() > condition.val.getTime()
        );
      }
      case 'isNull':
        return row[condition.col as string] == null;
      default:
        return false;
    }
  };

  return {
    matchCondition,
    db: {
      select: vi.fn(() => ({
        from: () => ({
          where: (condition: Condition) => ({
            limit: async () =>
              store.rows
                .filter(row => matchCondition(condition, row))
                .slice(0, 1),
          }),
        }),
      })),
      update: vi.fn(() => ({
        set: (values: Record<string, unknown>) => ({
          where: (condition: Condition) => {
            const apply = async () => {
              const row = store.rows.find(candidate =>
                matchCondition(condition, candidate)
              );
              if (!row) return [];
              Object.assign(row, values);
              return [{ id: row.id }];
            };
            // Supports both `.where(...)` awaited directly (verify route) and
            // the conditional `.returning()` claim (subscribe route).
            return {
              returning: () => apply(),
              then: (
                resolve: (value: unknown) => void,
                reject: (reason?: unknown) => void
              ) => {
                apply().then(resolve, reject);
              },
            };
          },
        }),
      })),
      insert: vi.fn(() => ({
        values: async (values: Record<string, unknown>) => {
          store.rows.push({
            id: crypto.randomUUID(),
            verified: false,
            ...values,
          });
        },
      })),
    },
  };
});

vi.mock('@/lib/db', () => ({ db: dbFake.db }));

vi.mock('@/lib/db/schema/product-update-subscribers', () => ({
  productUpdateSubscribers: {
    id: 'id',
    email: 'email',
    verified: 'verified',
    verificationToken: 'verificationToken',
    tokenExpiresAt: 'tokenExpiresAt',
    unsubscribeToken: 'unsubscribeToken',
    unsubscribedAt: 'unsubscribedAt',
    source: 'source',
    updatedAt: 'updatedAt',
  },
}));

/** The controlled mail sink: records every send, sends nothing. */
const mailSink = vi.hoisted(() => ({
  sends: [] as Array<{
    to: string;
    subject: string;
    text: string;
    html: string;
  }>,
}));

vi.mock('@/lib/email/send', () => ({
  sendEmail: vi.fn(
    async (options: {
      to: string;
      subject: string;
      text: string;
      html: string;
    }) => {
      mailSink.sends.push(options);
      return { success: true, messageId: 'controlled-mail-sink' };
    }
  ),
}));

vi.mock('@/lib/error-tracking', () => ({
  captureError: vi.fn(),
}));

vi.mock('server-only', () => ({}));

vi.mock('@/lib/turnstile/verify', async importOriginal => {
  const actual =
    await importOriginal<typeof import('@/lib/turnstile/verify')>();
  return {
    ...actual,
    // Non-production without configuration skips server verification, mirroring
    // the route's own branch for local/test environments.
    isTurnstileConfigured: vi.fn(() => false),
    verifyTurnstileToken: vi.fn(),
  };
});

vi.mock('@/lib/rate-limit', () => ({
  changelogSubscribeLimiter: {
    limit: vi.fn(async () => ({
      success: true,
      limit: 1,
      remaining: 0,
      reset: Date.now() + 10_000,
    })),
  },
  createRateLimitHeaders: vi.fn(() => ({})),
  getClientIP: vi.fn(() => '127.0.0.1'),
}));

vi.mock('@/lib/utils/logger', () => ({
  logger: {
    error: vi.fn(),
    warn: vi.fn(),
    info: vi.fn(),
  },
}));

const ORIGIN = 'https://changelog.test';

const originalFetch = global.fetch;

beforeEach(() => {
  store.rows = [];
  mailSink.sends = [];
  turnstileMock.provideToken = true;
  turnstileMock.unmountCount = 0;
  turnstileMock.resetSignal = 0;
  // Forward the component's fetch calls to the real subscribe route handler.
  global.fetch = vi.fn(async (input: unknown, init?: RequestInit) => {
    const raw = typeof input === 'string' ? input : String(input);
    const url = new URL(raw, ORIGIN);
    if (url.pathname !== '/api/changelog/subscribe') {
      throw new Error(`unexpected fetch: ${url.toString()}`);
    }
    const headers = new Map<string, string>(
      Object.entries((init?.headers ?? {}) as Record<string, string>)
    );
    const request = {
      url: url.toString(),
      headers: {
        get: (name: string) => headers.get(name.toLowerCase()) ?? null,
      },
      json: async () => JSON.parse(String(init?.body)),
    };
    return subscribePost(request as never);
  }) as typeof fetch;
});

afterEach(() => {
  global.fetch = originalFetch;
  vi.restoreAllMocks();
});

function verifyRequest(token: string) {
  const searchParams = new URL(`${ORIGIN}/api/changelog/verify?token=${token}`)
    .searchParams;
  return verifyGet({ nextUrl: { searchParams } } as never);
}

describe('changelog email signup connected flow (component + API + mail sink)', () => {
  it('shows the typo address, refuses an early resend, and corrects through the real flow', async () => {
    render(<ChangelogEmailSignup />);

    // 1. Submit a typo'd address through the real subscribe route. The typo
    // lives in the LOCAL part so every send stays inside the controlled
    // @example.com domain.
    fireEvent.change(screen.getByLabelText('Email address'), {
      target: { value: 'artits@example.com' },
    });
    fireEvent.submit(screen.getByTestId('changelog-subscribe-form'));

    const panel = await screen.findByTestId('changelog-confirmation-sent');
    expect(within(panel).getByText('artits@example.com')).toBeInTheDocument();
    expect(mailSink.sends.map(send => send.to)).toEqual(['artits@example.com']);
    // The confirmation went out with a real uuid token over the sink.
    expect(mailSink.sends[0].text).toMatch(
      /\/api\/changelog\/verify\?token=[0-9a-f-]{36}/i
    );

    // 2. An immediate resend is refused by the server-side cooldown (429)
    // and the panel keeps the submitted address.
    const resend = within(panel).getByRole('button', {
      name: 'Resend Confirmation',
    });
    await waitFor(() => expect(resend).not.toBeDisabled());
    fireEvent.click(resend);

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Please wait before resending.'
    );
    expect(within(panel).getByText('artits@example.com')).toBeInTheDocument();
    expect(mailSink.sends).toHaveLength(1);

    // 3. Correct the typo: the input is prefilled with the submitted address,
    // and the corrected address goes through the normal subscribe flow.
    fireEvent.click(
      within(panel).getByRole('button', { name: 'Use A Different Email' })
    );
    const input = screen.getByLabelText('Email address');
    expect(input).toHaveValue('artits@example.com');
    await waitFor(() => expect(input).toHaveFocus());

    fireEvent.change(input, { target: { value: 'artist@example.com' } });
    fireEvent.submit(screen.getByTestId('changelog-subscribe-form'));

    const correctedPanel = await screen.findByTestId(
      'changelog-confirmation-sent'
    );
    expect(
      within(correctedPanel).getByText('artist@example.com')
    ).toBeInTheDocument();
    expect(mailSink.sends.map(send => send.to)).toEqual([
      'artits@example.com',
      'artist@example.com',
    ]);
    // The corrected address is a brand-new subscriber row, never a transfer of
    // the typo'd row's confirmation.
    expect(store.rows.map(row => row.email)).toEqual([
      'artits@example.com',
      'artist@example.com',
    ]);
    expect(store.rows.every(row => row.verified === false)).toBe(true);

    // 4. Once the cooldown window has elapsed (simulated by rewinding the
    // persisted tokenExpiresAt), a resend succeeds through the same route.
    const correctedRow = store.rows.find(
      row => row.email === 'artist@example.com'
    );
    if (!correctedRow) {
      throw new Error(
        'The corrected email must have a persisted subscriber row'
      );
    }
    correctedRow.tokenExpiresAt = new Date(
      (correctedRow.tokenExpiresAt as Date).getTime() - 61_000
    );
    const correctedResend = within(correctedPanel).getByRole('button', {
      name: 'Resend Confirmation',
    });
    // The corrected submission consumed its token; wait for the fresh one.
    await waitFor(() => expect(correctedResend).not.toBeDisabled());
    fireEvent.click(correctedResend);

    await waitFor(() => {
      expect(
        within(correctedPanel).getByText(
          'Confirmation email sent again to artist@example.com.'
        )
      ).toBeInTheDocument();
    });
    expect(mailSink.sends.map(send => send.to)).toEqual([
      'artits@example.com',
      'artist@example.com',
      'artist@example.com',
    ]);
    // Every send landed in the controlled sink addresses only.
    expect(mailSink.sends.every(send => send.to.endsWith('@example.com'))).toBe(
      true
    );

    // 5. The resent confirmation carries a real token that the verify route
    // accepts exactly once, then reports as expired.
    const token = /token=([0-9a-f-]{36})/i.exec(mailSink.sends[2].text)?.[1];
    expect(token).toBeTruthy();

    const verified = await verifyRequest(token as string);
    expect(verified.status).toBe(200);
    expect(await verified.text()).toContain("You're subscribed!");
    expect(store.rows.find(row => row.email === 'artist@example.com')).toEqual(
      expect.objectContaining({ verified: true, verificationToken: null })
    );

    const replay = await verifyRequest(token as string);
    expect(replay.status).toBe(410);
    expect(await replay.text()).toContain('Link expired');
  });
});
