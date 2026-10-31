/**
 * /api/content-records/[kind]/[key]
 *
 * The write and history surface for versioned content records
 * (`lib/content-records/`). Callers: Tim through Ovie (admin, fresh session)
 * and Summer (Bearer `CONTENT_PUBLISH_SECRET` + `x-content-actor`).
 *
 * GET  → live pointer, versions, and audit events.
 * POST → one of:
 *   { action: 'validate', data }                 dry run, nothing stored
 *   { action: 'draft', data, note? }             new immutable version + preview URL
 *   { action: 'publish', versionId, reason? }    move the live pointer
 *   { action: 'rollback', toVersionId?, reason? } move it back (default: previous)
 *
 * Limits: body ≤ 64 KB; history returns the newest 50 versions and events.
 * Writers are authenticated admins or the one agent secret, so volume is
 * bounded by who can call it; every pointer move is an audit row.
 */

import { NextResponse } from 'next/server';
import { z } from 'zod';
import { BASE_URL } from '@/constants/app';
import { APP_ROUTES } from '@/constants/routes';
import {
  resolveContentWriter,
  signPreviewToken,
} from '@/lib/content-records/access.server';
import { gateContentRecord } from '@/lib/content-records/kind';
import { getContentKind } from '@/lib/content-records/registry';
import {
  ContentConflictError,
  ContentValidationError,
  createContentVersion,
  getContentHistory,
  publishContentVersion,
  rollbackContent,
} from '@/lib/content-records/store.server';
import { captureError } from '@/lib/error-tracking';
import { logger } from '@/lib/utils/logger';

export const runtime = 'nodejs';

const NO_STORE = { 'Cache-Control': 'no-store' } as const;
const MAX_BODY_BYTES = 64 * 1024;

const reason = z.string().trim().max(500).optional();
const RequestSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('validate'), data: z.unknown() }).strict(),
  z
    .object({
      action: z.literal('draft'),
      data: z.unknown(),
      note: z.string().trim().max(500).optional(),
    })
    .strict(),
  z
    .object({
      action: z.literal('publish'),
      versionId: z.uuid(),
      reason,
    })
    .strict(),
  z
    .object({
      action: z.literal('rollback'),
      toVersionId: z.uuid().optional(),
      reason,
    })
    .strict(),
]);

type RouteContext = { params: Promise<{ kind: string; key: string }> };

function json(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: NO_STORE });
}

function previewUrl(kind: string, key: string, versionId: string) {
  const token = signPreviewToken(versionId);
  if (!token || kind !== 'marketing-page' || key !== 'home') return null;
  return `${BASE_URL}${APP_ROUTES.CONTENT_PREVIEW}/${versionId}?token=${token}`;
}

async function resolve(request: Request, context: RouteContext) {
  const writer = await resolveContentWriter(request);
  if (!writer.ok)
    return { error: json({ error: writer.error }, writer.status) };
  const { kind, key } = await context.params;
  const definition = getContentKind(kind);
  if (!definition || !definition.keys.includes(key)) {
    return { error: json({ error: 'Unknown content record' }, 404) };
  }
  return { writer, definition, kind, key };
}

export async function GET(request: Request, context: RouteContext) {
  const resolved = await resolve(request, context);
  if ('error' in resolved) return resolved.error;
  try {
    return json(await getContentHistory(resolved.kind, resolved.key));
  } catch (error) {
    logger.error('[api/content-records] history failed', error);
    await captureError('Content record history failed', error, {
      route: '/api/content-records',
      method: 'GET',
    });
    return json({ error: 'Internal error' }, 500);
  }
}

export async function POST(request: Request, context: RouteContext) {
  const resolved = await resolve(request, context);
  if ('error' in resolved) return resolved.error;
  const { writer, definition, kind, key } = resolved;

  const raw = await request.text();
  if (raw.length > MAX_BODY_BYTES) {
    return json({ error: 'Body too large' }, 413);
  }
  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    return json({ error: 'Invalid JSON' }, 400);
  }
  const parsed = RequestSchema.safeParse(body);
  if (!parsed.success) {
    return json(
      { error: 'Invalid request', details: z.treeifyError(parsed.error) },
      400
    );
  }
  const input = parsed.data;

  try {
    switch (input.action) {
      case 'validate': {
        const result = gateContentRecord(definition, key, input.data);
        return json(
          result.ok ? { ok: true } : { ok: false, errors: result.errors },
          result.ok ? 200 : 422
        );
      }
      case 'draft': {
        const version = await createContentVersion(definition, {
          key,
          data: input.data,
          author: writer.actor,
          note: input.note,
        });
        const { data: _data, ...summary } = version;
        return json(
          { version: summary, previewUrl: previewUrl(kind, key, version.id) },
          201
        );
      }
      case 'publish':
        return json(
          await publishContentVersion(definition, {
            key,
            versionId: input.versionId,
            actor: writer.actor,
            reason: input.reason,
          })
        );
      case 'rollback':
        return json(
          await rollbackContent(definition, {
            key,
            toVersionId: input.toVersionId,
            actor: writer.actor,
            reason: input.reason,
          })
        );
      default: {
        const unsupported: never = input;
        return json({ error: 'Unsupported action', unsupported }, 400);
      }
    }
  } catch (error) {
    if (error instanceof ContentValidationError) {
      return json({ ok: false, errors: error.errors }, 422);
    }
    if (error instanceof ContentConflictError) {
      return json({ error: error.message }, 409);
    }
    logger.error('[api/content-records] write failed', error);
    await captureError('Content record write failed', error, {
      route: '/api/content-records',
      method: 'POST',
      kind,
      key,
      action: input.action,
    });
    return json({ error: 'Internal error' }, 500);
  }
}
