import type { ExtensionFillPreviewRequest } from '@jovie/extension-contracts';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { withSessionContext } from '@/lib/auth/session';
import { buildExtensionFillPreview } from '@/lib/extensions/fill-preview';
import { createExtensionCorsHeaders } from '@/lib/extensions/http';
import { parseJsonBody } from '@/lib/http/parse-json';

const requestSchema = z.object({
  workflowId: z.enum([
    'distrokid_release_form',
    'awal_release_form',
    'kosign_work_form',
  ]),
  entityId: z.string().min(1),
  entityKind: z.literal('release'),
  pageUrl: z.string().url(),
  pageTitle: z.string().nullable().optional(),
  pageVariant: z.string().nullable(),
  availableTargets: z.array(
    z.object({
      targetId: z.string().min(1),
      targetKey: z.string().min(1),
      targetLabel: z.string().min(1),
      currentValue: z.string().nullable(),
      groupIndex: z.number().int().min(0).optional(),
    })
  ),
});

export async function OPTIONS(request: Request) {
  return new NextResponse(null, {
    status: 204,
    headers: createExtensionCorsHeaders(request, 'POST, OPTIONS'),
  });
}

export async function POST(request: Request) {
  const parsedBody = await parseJsonBody<ExtensionFillPreviewRequest>(request, {
    route: 'POST /api/extension/actions/fill-preview',
    headers: createExtensionCorsHeaders(request, 'POST, OPTIONS'),
  });
  if (!parsedBody.ok) return parsedBody.response;

  const validation = requestSchema.safeParse(parsedBody.data);
  if (!validation.success) {
    return NextResponse.json(
      { error: 'Invalid fill preview payload' },
      {
        status: 400,
        headers: createExtensionCorsHeaders(request, 'POST, OPTIONS'),
      }
    );
  }

  return withSessionContext(
    async context => {
      if (!context.profile) {
        return NextResponse.json(
          { error: 'Profile not found' },
          {
            status: 404,
            headers: createExtensionCorsHeaders(request, 'POST, OPTIONS'),
          }
        );
      }

      const preview = await buildExtensionFillPreview(
        validation.data as ExtensionFillPreviewRequest,
        context.profile.id
      );
      if (!preview) {
        return NextResponse.json(
          { error: 'Release not found' },
          {
            status: 404,
            headers: createExtensionCorsHeaders(request, 'POST, OPTIONS'),
          }
        );
      }

      return NextResponse.json(preview, {
        headers: createExtensionCorsHeaders(request, 'POST, OPTIONS'),
      });
    },
    { requireProfile: true }
  );
}
