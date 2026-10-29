import { eq } from 'drizzle-orm';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/db';
import { ovieOperatingKv } from '@/lib/db/schema/ovie';
import { loadDeliverability } from '@/lib/email/deliverability/loop.server';
import { forgeReadiness } from '@/lib/email/deliverability/summary';
import { captureError } from '@/lib/error-tracking';
import { NO_STORE_HEADERS } from '@/lib/http/headers';
import { submitSummerCard } from '@/lib/ovie/summer-cards.server';
import { verifySummerOidcRequest } from '@/lib/ovie/summer-oidc.server';

export const runtime = 'nodejs';

/**
 * Email deliverability for Summer (aggregates only, never recipient data).
 *
 * GET   per-stream and per-domain delivered / bounce / complaint rates over
 *       the registry window, judged against stream-registry.json thresholds,
 *       plus Resend Forge readiness.
 * POST  Summer's weekly Resend Forge eligibility observation (read from the
 *       Resend domain page). When Resend says eligible AND every live stream
 *       is clean on real volume, files ONE one-tap Ovie card to Tim with the
 *       DNS record. Nothing activates Forge automatically.
 */

const FORGE_KEY = 'email-forge-eligibility';

const forgeObservation = z
  .object({
    forgeEligible: z.boolean(),
    observedAt: z.string().datetime({ offset: true }),
    source: z.string().trim().min(3).max(200),
    dnsRecord: z
      .object({
        type: z.string().trim().min(1).max(16),
        name: z.string().trim().min(1).max(253),
        value: z.string().trim().min(1).max(1024),
      })
      .strict()
      .optional(),
    evidenceUrl: z
      .url({ protocol: /^https$/u })
      .max(2048)
      .optional(),
  })
  .strict();

type ForgeObservation = z.infer<typeof forgeObservation>;

async function readForgeObservation(): Promise<ForgeObservation | null> {
  const [row] = await db
    .select({ value: ovieOperatingKv.value })
    .from(ovieOperatingKv)
    .where(eq(ovieOperatingKv.key, FORGE_KEY))
    .limit(1);
  const parsed = forgeObservation.safeParse(row?.value);
  return parsed.success ? parsed.data : null;
}

const unauthorized = () =>
  NextResponse.json(
    { error: 'Unauthorized' },
    { status: 401, headers: NO_STORE_HEADERS }
  );

export async function GET(request: Request): Promise<NextResponse> {
  if (!(await verifySummerOidcRequest(request))) return unauthorized();
  try {
    const observation = await readForgeObservation();
    const summary = await loadDeliverability(
      new Date(),
      observation?.forgeEligible ?? null
    );
    return NextResponse.json(
      { ...summary, forgeObservation: observation },
      { headers: NO_STORE_HEADERS }
    );
  } catch (error) {
    await captureError('Email deliverability read failed', error);
    return NextResponse.json(
      { error: 'Deliverability unavailable' },
      { status: 503, headers: NO_STORE_HEADERS }
    );
  }
}

export async function POST(request: Request): Promise<NextResponse> {
  if (!(await verifySummerOidcRequest(request))) return unauthorized();
  const parsed = forgeObservation.safeParse(
    await request.json().catch(() => null)
  );
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid Forge observation' },
      { status: 400, headers: NO_STORE_HEADERS }
    );
  }
  const observation = parsed.data;
  try {
    await db
      .insert(ovieOperatingKv)
      .values({ key: FORGE_KEY, value: observation, updatedAt: new Date() })
      .onConflictDoUpdate({
        target: ovieOperatingKv.key,
        set: { value: observation, updatedAt: new Date() },
      });

    const summary = await loadDeliverability();
    const forge = forgeReadiness(summary.streams, observation.forgeEligible);
    let card: string | null = null;
    if (forge.ready && observation.dnsRecord) {
      const record = observation.dnsRecord;
      const submission = await submitSummerCard({
        idempotencyKey: `email-forge-activate-${record.name.replaceAll(/[^A-Za-z0-9_-]/g, '-').slice(0, 80)}`,
        kind: 'decision',
        product: 'jov',
        title: 'Activate Resend Forge for Jovie email',
        body: [
          'Resend lists the account as Forge-eligible and every live stream is clean on real volume.',
          "Forge moves sending onto Resend's shared pool and falls back to the current engine automatically.",
          '',
          'DNS change (Vercel DNS, jov.ie):',
          `  ${record.type} ${record.name} -> ${record.value}`,
          '',
          'Then turn Forge on for the domain in Resend.',
          `Observed ${observation.observedAt} via ${observation.source}.`,
        ].join('\n'),
        recommendation: 'Approve: add the record and turn Forge on.',
        defaultIfSilent: 'Forge stays off.',
        recipient: null,
        amountUsd: null,
        preflightReceiptId: null,
        evidence: observation.evidenceUrl ? [observation.evidenceUrl] : [],
        decideBy: null,
        defaultDecision: 'none',
      });
      card = submission.outcome === 'conflict' ? null : submission.card.id;
    }
    return NextResponse.json(
      { recorded: true, forge, card },
      { headers: NO_STORE_HEADERS }
    );
  } catch (error) {
    await captureError('Forge observation failed', error);
    return NextResponse.json(
      { error: 'Forge observation failed' },
      { status: 503, headers: NO_STORE_HEADERS }
    );
  }
}
