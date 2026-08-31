import { and, eq } from 'drizzle-orm';
import { NextResponse } from 'next/server';
import { asConnectorStatusSql } from '@/lib/connectors/db-expressions';
import { CONNECTOR_PROVIDERS } from '@/lib/connectors/registry';
import { validateYouTubeProfileMutationRequest } from '@/lib/connectors/youtube/profile-request';
import { db } from '@/lib/db';
import { connectorAccounts } from '@/lib/db/schema/connectors';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  const validation = await validateYouTubeProfileMutationRequest(request);
  if (!validation.ok) return validation.response;

  await db
    .update(connectorAccounts)
    .set({
      status: asConnectorStatusSql('disabled'),
      encryptedAccessToken: null,
      encryptedRefreshToken: null,
      tokenExpiresAt: null,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(connectorAccounts.userId, validation.userId),
        eq(connectorAccounts.creatorProfileId, validation.creatorProfileId),
        eq(connectorAccounts.provider, CONNECTOR_PROVIDERS.youtube)
      )
    );
  return NextResponse.json({ ok: true });
}
