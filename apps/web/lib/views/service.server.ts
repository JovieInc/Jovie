import 'server-only';

import { and, eq, isNull } from 'drizzle-orm';
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
