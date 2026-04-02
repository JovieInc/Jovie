import type { ExtensionActionLogRequest } from '@jovie/extension-contracts';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { withSessionContext } from '@/lib/auth/session';
import { db } from '@/lib/db';
import { chatAuditLog } from '@/lib/db/schema/chat';
import { createExtensionCorsHeaders } from '@/lib/extensions/http';
import { parseJsonBody } from '@/lib/http/parse-json';

const requestSchema = z.object({
  action: z.enum(['insert', 'copy', 'sync', 'open']),
  entityId: z.string().min(1),
  entityKind: z.enum(['profile', 'release', 'tourDate']),
  fieldId: z.string().min(1).optional(),
  pageUrl: z.string().url(),
  pageTitle: z.string().nullable().optional(),
  result: z.enum(['pending', 'succeeded', 'failed']),
});

export async function OPTIONS(request: Request) {
  return new NextResponse(null, {
    status: 204,
    headers: createExtensionCorsHeaders(request, 'POST, OPTIONS'),
  });
}

export async function POST(request: Request) {
  try {
    const parsedBody = await parseJsonBody<ExtensionActionLogRequest>(request, {
      route: 'POST /api/extension/action-log',
      headers: createExtensionCorsHeaders(request, 'POST, OPTIONS'),
    });

    if (!parsedBody.ok) {
      return parsedBody.response;
    }

    const validation = requestSchema.safeParse(parsedBody.data);
    if (!validation.success) {
      return NextResponse.json(
        { error: 'Invalid action log payload' },
        {
          status: 400,
          headers: createExtensionCorsHeaders(request, 'POST, OPTIONS'),
        }
      );
    }

    return await withSessionContext(async context => {
      if (!context.profile) {
        return NextResponse.json(
          { error: 'Profile not found' },
          {
            status: 404,
            headers: createExtensionCorsHeaders(request, 'POST, OPTIONS'),
          }
        );
      }

      const body = validation.data;

      const [created] = await db
        .insert(chatAuditLog)
        .values({
          userId: context.user.id,
          creatorProfileId: context.profile.id,
          action: `extension_${body.action}_${body.result}`,
          field: body.fieldId ?? 'entity',
          previousValue: null,
          newValue: `${body.entityKind}:${body.entityId}`,
          metadata: {
            source: 'chrome_extension',
            pageUrl: body.pageUrl,
            pageTitle: body.pageTitle ?? null,
            entityKind: body.entityKind,
          },
        })
        .returning({ id: chatAuditLog.id });

      return NextResponse.json(
        {
          ok: true,
          actionId: created.id,
        },
        {
          headers: createExtensionCorsHeaders(request, 'POST, OPTIONS'),
        }
      );
    });
  } catch (error) {
    if (
      error instanceof Error &&
      (error.message === 'Unauthorized' || error.message === 'User not found')
    ) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        {
          status: 401,
          headers: createExtensionCorsHeaders(request, 'POST, OPTIONS'),
        }
      );
    }

    return NextResponse.json(
      { error: 'Unable to write extension action log.' },
      {
        status: 500,
        headers: createExtensionCorsHeaders(request, 'POST, OPTIONS'),
      }
    );
  }
}
