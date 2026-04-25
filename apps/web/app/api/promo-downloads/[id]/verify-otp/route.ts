/**
 * Promo Download OTP Verify
 *
 * Public endpoint. Verifies OTP code, confirms subscription,
 * generates signed download URLs for all active files in the release.
 * Analytics writes are best-effort (never block the download).
 */

import { and, eq } from 'drizzle-orm';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/db';
import { users } from '@/lib/db/schema/auth';
import { creatorProfiles } from '@/lib/db/schema/profiles';
import {
  promoDownloadEvents,
  promoDownloads,
} from '@/lib/db/schema/promo-downloads';
import {
  getPromoDownloadThankYouHtml,
  getPromoDownloadThankYouSubject,
  getPromoDownloadThankYouText,
} from '@/lib/email/templates/promo-download-thank-you';
import { captureError } from '@/lib/error-tracking';
import { NO_STORE_HEADERS } from '@/lib/http/headers';
import {
  upsertPromoAudienceMember,
  verifyEmailOtp,
} from '@/lib/notifications/otp-service';
import { sendNotification } from '@/lib/notifications/service';
import { decodeCityHeader } from '../_geo';

export const runtime = 'nodejs';

const verifySchema = z.object({
  email: z.string().email(),
  code: z.string().length(6),
});

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  try {
    const body = await request.json();
    const parsed = verifySchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid verification code' },
        { status: 400, headers: NO_STORE_HEADERS }
      );
    }

    // Fetch the promo download to get the creatorProfileId
    const [download] = await db
      .select({
        id: promoDownloads.id,
        creatorProfileId: promoDownloads.creatorProfileId,
        releaseId: promoDownloads.releaseId,
        title: promoDownloads.title,
        artworkUrl: promoDownloads.artworkUrl,
        isActive: promoDownloads.isActive,
        artistName: creatorProfiles.displayName,
        artistHandle: creatorProfiles.username,
        isPro: users.isPro,
      })
      .from(promoDownloads)
      .innerJoin(
        creatorProfiles,
        eq(creatorProfiles.id, promoDownloads.creatorProfileId)
      )
      .leftJoin(users, eq(users.id, creatorProfiles.userId))
      .where(eq(promoDownloads.id, id))
      .limit(1);

    if (!download?.isActive || !download?.isPro) {
      return NextResponse.json(
        { error: 'Not found' },
        { status: 404, headers: NO_STORE_HEADERS }
      );
    }

    // Verify OTP via shared service
    const otpResult = await verifyEmailOtp({
      email: parsed.data.email,
      creatorProfileId: download.creatorProfileId,
      code: parsed.data.code,
    });

    if (!otpResult.success) {
      return NextResponse.json(
        { error: otpResult.error },
        { status: otpResult.status, headers: NO_STORE_HEADERS }
      );
    }

    // Fetch ALL active files for this release (not just the one referenced by id)
    const allFiles = await db
      .select({
        id: promoDownloads.id,
        title: promoDownloads.title,
        fileUrl: promoDownloads.fileUrl,
        fileName: promoDownloads.fileName,
        fileMimeType: promoDownloads.fileMimeType,
        fileSizeBytes: promoDownloads.fileSizeBytes,
      })
      .from(promoDownloads)
      .where(
        and(
          eq(promoDownloads.releaseId, download.releaseId),
          eq(promoDownloads.isActive, true)
        )
      )
      .orderBy(promoDownloads.position);

    // Map files with their blob URLs (revealed only after OTP verification)
    // The fileUrl field stores the blob URL. Access control is at the API layer,
    // not the URL layer — the URL is only returned after successful OTP verify.
    const filesWithUrls = allFiles.map(file => ({
      id: file.id,
      title: file.title,
      fileName: file.fileName,
      fileMimeType: file.fileMimeType,
      fileSizeBytes: file.fileSizeBytes,
      downloadUrl: file.fileUrl,
    }));

    // Best-effort analytics: record download events + audience upsert
    const ip =
      request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? null;
    const ua = request.headers.get('user-agent') ?? null;
    const city = decodeCityHeader(request.headers.get('x-vercel-ip-city'));
    const country = request.headers.get('x-vercel-ip-country') ?? null;

    // Fire-and-forget: download events
    void (async () => {
      try {
        for (const file of allFiles) {
          await db.insert(promoDownloadEvents).values({
            promoDownloadId: file.id,
            creatorProfileId: download.creatorProfileId,
            email: parsed.data.email,
            ipAddress: ip,
            userAgent: ua,
            country,
            city,
          });
        }
      } catch (err) {
        captureError('Promo download event insert failed (best-effort)', err);
      }
    })();

    // Fire-and-forget: audience member upsert
    void upsertPromoAudienceMember(
      download.creatorProfileId,
      parsed.data.email,
      ip,
      ua
    );

    // Fire-and-forget: thank-you email
    void (async () => {
      try {
        const artistName = download.artistName ?? 'this artist';
        const artistHandle = download.artistHandle ?? '';
        const dedupKey = `promo_thanks:${download.releaseId}:${parsed.data.email}`;

        const templateData = {
          releaseTitle: download.title,
          artistName,
          artistHandle,
          artworkUrl: download.artworkUrl,
          files: filesWithUrls.map(f => ({
            title: f.title,
            downloadUrl: f.downloadUrl,
            fileMimeType: f.fileMimeType,
            fileSizeBytes: f.fileSizeBytes,
          })),
        };

        await sendNotification(
          {
            id: dedupKey,
            dedupKey,
            category: 'transactional',
            subject: getPromoDownloadThankYouSubject(templateData),
            text: getPromoDownloadThankYouText(templateData),
            html: getPromoDownloadThankYouHtml(templateData),
            channels: ['email'],
            respectUserPreferences: false,
            dismissible: true,
          },
          {
            email: parsed.data.email,
            creatorProfileId: download.creatorProfileId,
          }
        );
      } catch (err) {
        captureError(
          'Promo download thank-you email failed (best-effort)',
          err
        );
      }
    })();

    return NextResponse.json(
      {
        success: true,
        files: filesWithUrls.map(f => ({
          id: f.id,
          title: f.title,
          fileName: f.fileName,
          fileMimeType: f.fileMimeType,
          fileSizeBytes: f.fileSizeBytes,
          downloadUrl: f.downloadUrl,
        })),
      },
      { headers: NO_STORE_HEADERS }
    );
  } catch (err) {
    captureError('Promo download OTP verify error', err);
    return NextResponse.json(
      { error: 'Verification failed' },
      { status: 500, headers: NO_STORE_HEADERS }
    );
  }
}
