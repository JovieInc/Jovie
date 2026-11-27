import 'server-only';

import { and, desc, eq, isNull } from 'drizzle-orm';
import { BASE_URL } from '@/constants/domains';
import { db } from '@/lib/db';
import { runAtomicDbOperation } from '@/lib/db/legacy-transaction';
import {
  dashboardViews,
  dashboardViewVersions,
} from '@/lib/db/schema/dashboard-views';
import { VIEW_SPEC_MAX_BYTES, type ViewSpec, viewSpecSchema } from './spec';
import { generateViewShareToken, isViewShareToken } from './token';

export type PublishViewErrorCode =
  | 'invalid_spec'
  | 'spec_too_large'
  | 'view_not_found';

export class PublishViewError extends Error {
  constructor(
    readonly code: PublishViewErrorCode,
    message: string
  ) {
    super(message);
    this.name = 'PublishViewError';
  }
}

export interface PublishViewInput {
  readonly ownerUserId: string;
  readonly viewId?: string;
  readonly spec: unknown;
  readonly createdBy: string;
}

export interface PublishViewResult {
  readonly id: string;
  readonly version: number;
  readonly token: string;
  readonly url: string;
}

export interface SharedView {
  readonly id: string;
  readonly title: string;
  readonly spec: ViewSpec;
  readonly version: number;
  readonly updatedAt: Date;
  readonly ownerUserId: string;
}

export function buildViewShareUrl(token: string): string {
  return `${BASE_URL}/v/${token}`;
}

function parseSpec(raw: unknown): ViewSpec {
  const parsed = viewSpecSchema.safeParse(raw);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    const path = issue?.path.join('.') || 'spec';
    throw new PublishViewError(
      'invalid_spec',
      `Invalid view spec at ${path}: ${issue?.message ?? 'invalid'}`
    );
  }
  if (Buffer.byteLength(JSON.stringify(parsed.data)) > VIEW_SPEC_MAX_BYTES) {
    throw new PublishViewError('spec_too_large', 'View spec exceeds 512 KB');
  }
  return parsed.data;
}

export async function publishView(
  input: PublishViewInput
): Promise<PublishViewResult> {
  const spec = parseSpec(input.spec);
  const { ownerUserId, viewId, createdBy } = input;

  return runAtomicDbOperation(
    async tx => {
      if (!viewId) {
        const token = generateViewShareToken();
        const [row] = await tx
          .insert(dashboardViews)
          .values({
            ownerUserId,
            title: spec.title,
            spec,
            version: 1,
            shareToken: token,
            source: 'agent',
            createdBy,
          })
          .returning({ id: dashboardViews.id });
        if (!row) throw new Error('Failed to insert view');
        await tx
          .insert(dashboardViewVersions)
          .values({ viewId: row.id, version: 1, spec, createdBy });
        return {
          id: row.id,
          version: 1,
          token,
          url: buildViewShareUrl(token),
        };
      }

      const [existing] = await tx
        .select({
          version: dashboardViews.version,
          shareToken: dashboardViews.shareToken,
        })
        .from(dashboardViews)
        .where(
          and(
            eq(dashboardViews.id, viewId),
            eq(dashboardViews.ownerUserId, ownerUserId),
            isNull(dashboardViews.revokedAt)
          )
        )
        .limit(1);
      if (!existing) {
        throw new PublishViewError('view_not_found', 'View not found');
      }
      const version = existing.version + 1;
      await tx
        .update(dashboardViews)
        .set({ title: spec.title, spec, version, updatedAt: new Date() })
        .where(eq(dashboardViews.id, viewId));
      await tx
        .insert(dashboardViewVersions)
        .values({ viewId, version, spec, createdBy });
      return {
        id: viewId,
        version,
        token: existing.shareToken,
        url: buildViewShareUrl(existing.shareToken),
      };
    },
    { actorId: ownerUserId, retry: 'never' }
  );
}

export async function getSharedView(token: string): Promise<SharedView | null> {
  if (!isViewShareToken(token)) return null;
  const [row] = await db
    .select({
      id: dashboardViews.id,
      title: dashboardViews.title,
      spec: dashboardViews.spec,
      version: dashboardViews.version,
      updatedAt: dashboardViews.updatedAt,
      ownerUserId: dashboardViews.ownerUserId,
    })
    .from(dashboardViews)
    .where(
      and(
        eq(dashboardViews.shareToken, token),
        isNull(dashboardViews.revokedAt)
      )
    )
    .limit(1);
  if (!row) return null;
  // Stored specs were validated on write; re-validate so a bad row never renders.
  const parsed = viewSpecSchema.safeParse(row.spec);
  if (!parsed.success) return null;
  return { ...row, spec: parsed.data };
}

export interface SaveViewResult {
  readonly id: string;
  readonly token: string;
  readonly url: string;
  /** False when the viewer already owned the view or had already saved it. */
  readonly created: boolean;
}

/**
 * Save a shared view into the viewer's own dashboards. Idempotent: an owner
 * gets their own view back, and a repeat save returns the existing copy.
 */
export async function saveViewAsDashboard(input: {
  readonly token: string;
  readonly userId: string;
}): Promise<SaveViewResult> {
  const { token, userId } = input;
  if (!isViewShareToken(token)) {
    throw new PublishViewError('view_not_found', 'View not found');
  }

  return runAtomicDbOperation(
    async tx => {
      const [source] = await tx
        .select({
          id: dashboardViews.id,
          ownerUserId: dashboardViews.ownerUserId,
          title: dashboardViews.title,
          spec: dashboardViews.spec,
          shareToken: dashboardViews.shareToken,
        })
        .from(dashboardViews)
        .where(
          and(
            eq(dashboardViews.shareToken, token),
            isNull(dashboardViews.revokedAt)
          )
        )
        .limit(1);
      if (!source) {
        throw new PublishViewError('view_not_found', 'View not found');
      }
      if (source.ownerUserId === userId) {
        return {
          id: source.id,
          token: source.shareToken,
          url: buildViewShareUrl(source.shareToken),
          created: false,
        };
      }

      const [existing] = await tx
        .select({
          id: dashboardViews.id,
          shareToken: dashboardViews.shareToken,
        })
        .from(dashboardViews)
        .where(
          and(
            eq(dashboardViews.forkedFromViewId, source.id),
            eq(dashboardViews.ownerUserId, userId),
            isNull(dashboardViews.revokedAt)
          )
        )
        .limit(1);
      if (existing) {
        return {
          id: existing.id,
          token: existing.shareToken,
          url: buildViewShareUrl(existing.shareToken),
          created: false,
        };
      }

      const spec = parseSpec(source.spec);
      const newToken = generateViewShareToken();
      const [row] = await tx
        .insert(dashboardViews)
        .values({
          ownerUserId: userId,
          title: source.title,
          spec,
          version: 1,
          shareToken: newToken,
          source: 'user',
          createdBy: 'user',
          forkedFromViewId: source.id,
        })
        .returning({ id: dashboardViews.id });
      if (!row) throw new Error('Failed to insert view');
      await tx
        .insert(dashboardViewVersions)
        .values({ viewId: row.id, version: 1, spec, createdBy: 'user' });
      return {
        id: row.id,
        token: newToken,
        url: buildViewShareUrl(newToken),
        created: true,
      };
    },
    { actorId: userId, retry: 'never' }
  );
}

export interface OwnedDashboard {
  readonly id: string;
  readonly title: string;
  readonly token: string;
  readonly version: number;
  readonly source: 'agent' | 'user';
  readonly updatedAt: Date;
}

export async function listDashboardsForOwner(
  userId: string
): Promise<OwnedDashboard[]> {
  const rows = await db
    .select({
      id: dashboardViews.id,
      title: dashboardViews.title,
      token: dashboardViews.shareToken,
      version: dashboardViews.version,
      source: dashboardViews.source,
      updatedAt: dashboardViews.updatedAt,
    })
    .from(dashboardViews)
    .where(
      and(
        eq(dashboardViews.ownerUserId, userId),
        isNull(dashboardViews.revokedAt)
      )
    )
    .orderBy(desc(dashboardViews.updatedAt))
    .limit(100);
  return rows.map(row => ({
    ...row,
    source: row.source === 'agent' ? 'agent' : 'user',
  }));
}
