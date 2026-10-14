import 'server-only';

import { createHash } from 'node:crypto';
import { and, sql as drizzleSql, eq, gt, isNull, or } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '@/lib/db';
import { users } from '@/lib/db/schema/auth';
import { baSessions, baUsers } from '@/lib/db/schema/better-auth';
import {
  DOGFOOD_MODES,
  DOGFOOD_PRODUCTS,
  type Dogfooder,
  type DogfooderBinding,
  type DogfoodProduct,
  dogfooderBindings,
  dogfooders,
} from '@/lib/db/schema/dogfooders';
import {
  type DogfoodExposureBinding,
  type DogfoodExposureMembership,
  type DogfooderBindingInput,
  type DogfooderUpsert,
  evaluateDogfoodExposure,
  normalizeDogfooderUpsert,
} from '@/lib/ovie/dogfood-roster';
import {
  getActiveSyntheticPrincipal,
  type SyntheticPrincipal,
} from '@/lib/synthetic/principals';

function adminView(row: Dogfooder, bindings: readonly DogfooderBinding[]) {
  return { ...row, bindings };
}

export async function listDogfooders() {
  const [rows, bindings] = await Promise.all([
    db.select().from(dogfooders).orderBy(dogfooders.actorKey),
    db.select().from(dogfooderBindings).orderBy(dogfooderBindings.bindingKey),
  ]);
  const byDogfooder = new Map<string, DogfooderBinding[]>();
  for (const binding of bindings) {
    const current = byDogfooder.get(binding.dogfooderId) ?? [];
    current.push(binding);
    byDogfooder.set(binding.dogfooderId, current);
  }
  return rows.map(row => adminView(row, byDogfooder.get(row.id) ?? []));
}

function bindingKey(dogfooderId: string, input: DogfooderBindingInput): string {
  const subjects = [
    dogfooderId,
    input.product,
    input.accountSubject,
    input.sessionSubject,
    input.deviceSubject,
  ];
  return createHash('sha256').update(JSON.stringify(subjects)).digest('hex');
}

async function writeBindings(
  dogfooderId: string,
  inputs: readonly DogfooderBindingInput[],
  overwrite: boolean
): Promise<void> {
  if (inputs.length === 0) return;
  const now = new Date();
  const values = inputs.map(input => ({
    dogfooderId,
    product: input.product,
    accountSubject: input.accountSubject,
    sessionSubject: input.sessionSubject,
    deviceSubject: input.deviceSubject,
    bindingKey: bindingKey(dogfooderId, input),
    status: input.status,
    expiresAt: input.expiresAt ? new Date(input.expiresAt) : null,
    revokedAt: input.revokedAt ? new Date(input.revokedAt) : null,
    lastSeenAt: now,
    updatedAt: now,
  }));
  const insert = db.insert(dogfooderBindings).values(values);
  if (!overwrite) {
    await insert.onConflictDoNothing({ target: dogfooderBindings.bindingKey });
    return;
  }
  await insert.onConflictDoUpdate({
    target: dogfooderBindings.bindingKey,
    set: {
      status: drizzleSql`excluded.status`,
      expiresAt: drizzleSql`excluded.expires_at`,
      revokedAt: drizzleSql`excluded.revoked_at`,
      lastSeenAt: now,
      updatedAt: now,
    },
  });
}

export async function upsertDogfooder(input: DogfooderUpsert) {
  const [current] = await db
    .select({ id: dogfooders.id, signalState: dogfooders.signalState })
    .from(dogfooders)
    .where(eq(dogfooders.actorKey, input.actorKey))
    .limit(1);
  const normalized = normalizeDogfooderUpsert(
    current?.signalState ?? null,
    input
  );
  const now = new Date();
  const values = {
    actorKey: normalized.actorKey,
    actorKind: normalized.actorKind,
    displayName: normalized.displayName,
    tier: normalized.tier,
    products: normalized.products,
    channel: normalized.channel,
    handle: normalized.handle,
    jovieUserId: normalized.jovieUserId,
    consent: normalized.consent,
    signalState: normalized.signalState,
    vouchedBy: normalized.vouchedBy,
    calibration: normalized.calibration,
    contactBudget: normalized.contactBudget,
    scopes: normalized.scopes,
    allowedModes: normalized.allowedModes,
    membershipExpiresAt: normalized.membershipExpiresAt
      ? new Date(normalized.membershipExpiresAt)
      : null,
    lastContactedAt: normalized.lastContactedAt
      ? new Date(normalized.lastContactedAt)
      : null,
    lastFeedbackAt: normalized.lastFeedbackAt
      ? new Date(normalized.lastFeedbackAt)
      : null,
    updatedAt: now,
  };
  const [row] = await db
    .insert(dogfooders)
    .values(values)
    .onConflictDoUpdate({
      target: dogfooders.actorKey,
      set: values,
    })
    .returning();
  if (!row) throw new Error('Dogfooder upsert returned no row');
  await writeBindings(row.id, normalized.bindings, true);
  const bindings = await db
    .select()
    .from(dogfooderBindings)
    .where(eq(dogfooderBindings.dogfooderId, row.id))
    .orderBy(dogfooderBindings.bindingKey);
  return adminView(row, bindings);
}

const exposureRequestSchema = z
  .object({
    sessionId: z.string().trim().min(1).max(255),
    deviceSubject: z.string().trim().min(1).max(255).nullable().default(null),
    product: z.enum(DOGFOOD_PRODUCTS),
    mode: z.enum(DOGFOOD_MODES),
    requestedScopes: z.array(z.string().trim().min(1).max(96)).max(32),
  })
  .strict();

export type DogfoodExposureRequest = z.infer<typeof exposureRequestSchema>;

export interface AuthoritativeDogfoodSession {
  readonly id: string;
  readonly accountSubject: string;
  readonly email: string;
  readonly expiresAt: Date;
  readonly jovieUserId: string | null;
}

export interface DogfoodMembershipLocation {
  readonly membership: DogfoodExposureMembership;
  readonly binding: DogfoodExposureBinding;
  readonly hasExactSessionBinding: boolean;
}

export interface DogfoodRosterResolverDeps {
  readSession: typeof readSession;
  findForAccount: typeof findForAccount;
  findForJovieUser: typeof findForJovieUser;
  findByActorKey: typeof findByActorKey;
  actorHasAccount: typeof actorHasAccount;
  ensureBindings: typeof ensureBindings;
  bootstrapSynthetic: typeof bootstrapSynthetic;
}

function exposureMembership(row: Dogfooder): DogfoodExposureMembership {
  return {
    id: row.id,
    actorKey: row.actorKey,
    products: row.products as DogfoodProduct[],
    scopes: row.scopes,
    allowedModes: row.allowedModes as DogfoodExposureMembership['allowedModes'],
    signalState: row.signalState,
    consent: row.consent,
    membershipExpiresAt: row.membershipExpiresAt,
  };
}

async function readSession(
  sessionId: string,
  now: Date
): Promise<AuthoritativeDogfoodSession | null> {
  const [row] = await db
    .select({
      id: baSessions.id,
      accountSubject: baSessions.userId,
      email: baUsers.email,
      expiresAt: baSessions.expiresAt,
      jovieUserId: users.id,
    })
    .from(baSessions)
    .innerJoin(baUsers, eq(baUsers.id, baSessions.userId))
    .leftJoin(users, eq(users.betterAuthUserId, baUsers.id))
    .where(and(eq(baSessions.id, sessionId), gt(baSessions.expiresAt, now)))
    .limit(1);
  return row ?? null;
}

async function findForAccount(input: {
  product: DogfoodProduct;
  accountSubject: string;
  sessionSubject: string;
}): Promise<DogfoodMembershipLocation | null> {
  const rows = await db
    .select({ membership: dogfooders, binding: dogfooderBindings })
    .from(dogfooderBindings)
    .innerJoin(dogfooders, eq(dogfooders.id, dogfooderBindings.dogfooderId))
    .where(
      and(
        eq(dogfooderBindings.product, input.product),
        eq(dogfooderBindings.accountSubject, input.accountSubject)
      )
    );
  const exact = rows.find(
    row => row.binding.sessionSubject === input.sessionSubject
  );
  const account = rows.find(row => row.binding.sessionSubject === null);
  const selected = exact ?? account;
  return selected
    ? {
        membership: exposureMembership(selected.membership),
        binding: selected.binding,
        hasExactSessionBinding: exact !== undefined,
      }
    : null;
}

async function findForJovieUser(input: {
  product: DogfoodProduct;
  jovieUserId: string;
}): Promise<DogfoodExposureMembership | null> {
  const [row] = await db
    .select()
    .from(dogfooders)
    .where(eq(dogfooders.jovieUserId, input.jovieUserId))
    .limit(1);
  return row?.products.includes(input.product) ? exposureMembership(row) : null;
}

async function findByActorKey(
  actorKey: string
): Promise<DogfoodExposureMembership | null> {
  const [row] = await db
    .select()
    .from(dogfooders)
    .where(eq(dogfooders.actorKey, actorKey))
    .limit(1);
  return row ? exposureMembership(row) : null;
}

async function actorHasAccount(input: {
  membershipId: string;
  accountSubject: string;
  now: Date;
}): Promise<boolean> {
  const [row] = await db
    .select({ id: dogfooderBindings.id })
    .from(dogfooderBindings)
    .where(
      and(
        eq(dogfooderBindings.dogfooderId, input.membershipId),
        eq(dogfooderBindings.accountSubject, input.accountSubject),
        eq(dogfooderBindings.status, 'active'),
        isNull(dogfooderBindings.revokedAt),
        or(
          isNull(dogfooderBindings.expiresAt),
          gt(dogfooderBindings.expiresAt, input.now)
        )
      )
    )
    .limit(1);
  return row !== undefined;
}

async function ensureBindings(input: {
  membershipId: string;
  session: AuthoritativeDogfoodSession;
  product: DogfoodProduct;
  deviceSubject: string | null;
}): Promise<DogfoodExposureBinding> {
  const expiresAt = input.session.expiresAt.toISOString();
  const base = {
    product: input.product,
    accountSubject: input.session.accountSubject,
    status: 'active' as const,
    revokedAt: null,
  };
  const observed: DogfooderBindingInput = {
    ...base,
    sessionSubject: input.session.id,
    deviceSubject: input.deviceSubject,
    expiresAt,
  };
  await writeBindings(
    input.membershipId,
    [
      { ...base, sessionSubject: null, deviceSubject: null, expiresAt: null },
      observed,
    ],
    false
  );
  const [binding] = await db
    .select()
    .from(dogfooderBindings)
    .where(
      eq(dogfooderBindings.bindingKey, bindingKey(input.membershipId, observed))
    )
    .limit(1);
  if (!binding) throw new Error('Dogfood session binding was not persisted');
  return binding;
}

async function bootstrapSynthetic(input: {
  principal: SyntheticPrincipal;
  session: AuthoritativeDogfoodSession;
  product: DogfoodProduct;
  deviceSubject: string | null;
  now: Date;
}): Promise<DogfoodMembershipLocation> {
  const consentAt = input.now.toISOString();
  const view = await upsertDogfooder({
    actorKey: `synthetic:${input.principal.actorId}`,
    actorKind: 'agent',
    displayName: input.principal.label,
    tier: null,
    products: ['jov', 'lyb'],
    channel: null,
    handle: null,
    jovieUserId: input.session.jovieUserId,
    consent: {
      grantedAt: consentAt,
      scope: ['internal_agent_dogfood'],
      source: 'synthetic-principal-registry',
      revokedAt: null,
    },
    signalState: 'qualified',
    vouchedBy: null,
    calibration: null,
    contactBudget: { maxContacts: 0, windowDays: 7 },
    scopes: ['approved_internal_features'],
    allowedModes: ['customer_control', 'early_access'],
    membershipExpiresAt: null,
    lastContactedAt: null,
    lastFeedbackAt: null,
    bindings: [],
  });
  const binding = await ensureBindings({
    membershipId: view.id,
    session: input.session,
    product: input.product,
    deviceSubject: input.deviceSubject,
  });
  const row = await findByActorKey(view.actorKey);
  if (!row) throw new Error('Synthetic dogfooder bootstrap was not persisted');
  return { membership: row, binding, hasExactSessionBinding: true };
}

export const defaultDogfoodRosterResolverDeps: DogfoodRosterResolverDeps = {
  readSession,
  findForAccount,
  findForJovieUser,
  findByActorKey,
  actorHasAccount,
  ensureBindings,
  bootstrapSynthetic,
};

export async function resolveDogfoodExposureForSession(
  request: DogfoodExposureRequest,
  deps: DogfoodRosterResolverDeps = defaultDogfoodRosterResolverDeps,
  now = new Date()
) {
  const input = exposureRequestSchema.parse(request);
  const expected = {
    product: input.product,
    mode: input.mode,
    scopes:
      input.mode === 'early_access'
        ? [...new Set(input.requestedScopes)].sort()
        : [],
  } as const;
  const denied = (reason: string) =>
    ({ eligible: false, reason, expected, repair: null }) as const;
  const session = await deps.readSession(input.sessionId, now);
  if (!session) return denied('invalid_session');

  let located = await deps.findForAccount({
    product: input.product,
    accountSubject: session.accountSubject,
    sessionSubject: session.id,
  });
  if (!located && session.jovieUserId) {
    const membership = await deps.findForJovieUser({
      product: input.product,
      jovieUserId: session.jovieUserId,
    });
    if (membership) {
      const binding = await deps.ensureBindings({
        membershipId: membership.id,
        session,
        product: input.product,
        deviceSubject: input.deviceSubject,
      });
      located = { membership, binding, hasExactSessionBinding: true };
    }
  }

  if (!located) {
    const principal = getActiveSyntheticPrincipal(session.email, 'auth');
    if (!principal || input.product === 'ovie')
      return denied('unregistered_principal');
    const actorKey = `synthetic:${principal.actorId}`;
    const existing = await deps.findByActorKey(actorKey);
    if (
      existing &&
      !(await deps.actorHasAccount({
        membershipId: existing.id,
        accountSubject: session.accountSubject,
        now,
      }))
    )
      return denied('explicit_mapping_required');
    if (existing) {
      const membershipDecision = evaluateDogfoodExposure({
        membership: existing,
        binding: {
          id: 'pending-session-binding',
          status: 'active',
          expiresAt: session.expiresAt,
          revokedAt: null,
        },
        product: input.product,
        mode: input.mode,
        requestedScopes: input.requestedScopes,
        now,
      });
      if (!membershipDecision.eligible) return membershipDecision;
    }
    located = await deps.bootstrapSynthetic({
      principal,
      session,
      product: input.product,
      deviceSubject: input.deviceSubject,
      now,
    });
  } else if (!located.hasExactSessionBinding) {
    const bindingDecision = evaluateDogfoodExposure({
      membership: located.membership,
      binding: located.binding,
      product: input.product,
      mode: input.mode,
      requestedScopes: input.requestedScopes,
      now,
    });
    if (!bindingDecision.eligible) return bindingDecision;
    const binding = await deps.ensureBindings({
      membershipId: located.membership.id,
      session,
      product: input.product,
      deviceSubject: input.deviceSubject,
    });
    located = { ...located, binding, hasExactSessionBinding: true };
  }

  return evaluateDogfoodExposure({
    membership: located.membership,
    binding: located.binding,
    product: input.product,
    mode: input.mode,
    requestedScopes: input.requestedScopes,
    now,
  });
}
