import { NextResponse } from 'next/server';
import {
  certifyContactEvidence,
  getContactCertificationInspection,
  reviewContactEvidence,
} from '@/lib/admin/contact-certification';
import {
  getCanonicalContactByKey,
  getCanonicalContacts,
  getContactStageTimeline,
  setCanonicalContactStage,
} from '@/lib/admin/contacts';
import {
  CONTACT_EVIDENCE_DECISIONS,
  type ContactEvidenceDecision,
} from '@/lib/contacts/certification';
import { isContactLifecycleStage } from '@/lib/contacts/lifecycle';
import { getOvieOperatorEntitlements } from '@/lib/ovie/privacy-lock/access';

export const runtime = 'nodejs';

const NO_STORE_HEADERS = { 'Cache-Control': 'no-store' } as const;
const jsonError = (error: string, status: number) =>
  NextResponse.json({ error }, { status, headers: NO_STORE_HEADERS });

async function requireAdmin(purpose?: 'read') {
  const entitlements = await getOvieOperatorEntitlements({ purpose });
  if (!entitlements.isAuthenticated) {
    return { error: jsonError('Unauthorized', 401) };
  }
  if (!entitlements.isAdmin) {
    return { error: jsonError('Forbidden', 403) };
  }
  return { entitlements };
}

export async function GET(request: Request) {
  const gate = await requireAdmin('read');
  if (gate.error) return gate.error;

  const { searchParams } = new URL(request.url);
  const dedupeKey = searchParams.get('key');

  if (dedupeKey) {
    const contact = await getCanonicalContactByKey(dedupeKey);
    if (!contact) return jsonError('Contact not found', 404);
    const [timeline, certification] = await Promise.all([
      getContactStageTimeline(dedupeKey),
      getContactCertificationInspection(contact),
    ]);
    return NextResponse.json(
      {
        certification,
        timeline: timeline.map(item => ({
          ...item,
          createdAt: item.createdAt.toISOString(),
        })),
      },
      { headers: NO_STORE_HEADERS }
    );
  }

  const result = await getCanonicalContacts({
    page: Number(searchParams.get('page') ?? '1'),
    pageSize: Number(searchParams.get('pageSize') ?? '50'),
    search: searchParams.get('q') ?? '',
    stage: searchParams.get('stage'),
  });

  return NextResponse.json(
    { rows: result.contacts, total: result.total },
    { headers: NO_STORE_HEADERS }
  );
}

interface StageUpdateBody {
  action?: 'review_evidence' | 'certify_profile';
  dedupeKey?: string;
  toStage?: string;
  reason?: string;
  identity?: {
    displayName?: string | null;
    emailNormalized?: string | null;
    primaryHandle?: string | null;
    avatarUrl?: string | null;
    userId?: string | null;
    creatorProfileId?: string | null;
    leadId?: string | null;
    waitlistEntryId?: string | null;
  };
  evidenceKey?: string;
  evidenceRevision?: string;
  decision?: ContactEvidenceDecision;
  correction?: string | null;
}

export async function POST(request: Request) {
  const gate = await requireAdmin();
  if (gate.error) return gate.error;

  let body: StageUpdateBody;
  try {
    body = (await request.json()) as StageUpdateBody;
  } catch {
    return jsonError('Invalid JSON body', 400);
  }

  if (typeof body.dedupeKey !== 'string' || body.dedupeKey.length === 0) {
    return jsonError('dedupeKey is required', 400);
  }

  const actorId = gate.entitlements?.userId ?? null;

  if (body.action === 'review_evidence') {
    if (
      typeof body.dedupeKey !== 'string' ||
      typeof body.evidenceKey !== 'string' ||
      typeof body.evidenceRevision !== 'string' ||
      !CONTACT_EVIDENCE_DECISIONS.includes(
        body.decision as ContactEvidenceDecision
      ) ||
      (body.correction != null &&
        (typeof body.correction !== 'string' || body.correction.length > 500))
    ) {
      return jsonError('Invalid evidence review', 400);
    }
    const contact = await getCanonicalContactByKey(body.dedupeKey);
    if (!contact) return jsonError('Contact not found', 404);
    const result = await reviewContactEvidence({
      contact,
      evidenceKey: body.evidenceKey,
      evidenceRevision: body.evidenceRevision,
      decision: body.decision as ContactEvidenceDecision,
      correction: body.correction,
      actorUserId: actorId,
    });
    if (!result.ok) return jsonError(result.reason, 409);
    const refreshed = await getCanonicalContactByKey(body.dedupeKey);
    return NextResponse.json(
      {
        ok: true,
        certification: await getContactCertificationInspection(
          refreshed ?? contact
        ),
      },
      { headers: NO_STORE_HEADERS }
    );
  }

  if (body.action === 'certify_profile') {
    if (
      typeof body.dedupeKey !== 'string' ||
      typeof body.evidenceRevision !== 'string'
    ) {
      return jsonError('Invalid certification request', 400);
    }
    const contact = await getCanonicalContactByKey(body.dedupeKey);
    if (!contact) return jsonError('Contact not found', 404);
    const result = await certifyContactEvidence({
      contact,
      evidenceRevision: body.evidenceRevision,
      actorUserId: actorId,
    });
    if (!result.ok) return jsonError(result.reason, 409);
    const refreshed = await getCanonicalContactByKey(body.dedupeKey);
    return NextResponse.json(
      {
        ok: true,
        certification: await getContactCertificationInspection(
          refreshed ?? contact
        ),
      },
      { headers: NO_STORE_HEADERS }
    );
  }

  if (!isContactLifecycleStage(body.toStage)) {
    return jsonError('A valid toStage is required', 400);
  }

  const result = await setCanonicalContactStage({
    dedupeKey: body.dedupeKey,
    toStage: body.toStage,
    actorUserId: actorId,
    actorType: 'founder',
    reason: body.reason ?? null,
    identity: body.identity,
  });

  if (!result.ok) {
    return jsonError('Contacts table unavailable', 503);
  }

  return NextResponse.json(
    { ok: true, stage: result.stage },
    { headers: NO_STORE_HEADERS }
  );
}
