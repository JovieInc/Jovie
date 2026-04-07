/**
 * Promo Download OTP Verify
 *
 * Public endpoint. Verifies OTP code, confirms subscription,
 * generates signed download URLs for all active files in the release.
 * Analytics writes are best-effort (never block the download).
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/db';
import { promoDownloadEvents } from '@/lib/db/schema/promo-downloads';
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
import {
  getActivePromoFiles,
  getPromoDownloadWithCreator,
} from '@/lib/promo-downloads/queries';
import { extractGeoFromHeaders } from '@/lib/promo-downloads/request-utils';

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
    const download = await getPromoDownloadWithCreator(id);

    if (!download || !download.isActive || !download.isPro) {
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

    // Fetch ALL active files for this release
    const allFiles = await getActivePromoFiles(download.releaseId);

    // Map files with their blob URLs (revealed only after OTP verification)
    const filesWithUrls = allFiles.map(file => ({
      id: file.id,
      title: file.title,
      fileName: file.fileName,
      fileMimeType: file.fileMimeType,
      fileSizeBytes: file.fileSizeBytes,
      downloadUrl: file.fileUrl,
    }));

    // Best-effort analytics
    const { ip, country, city, userAgent } = extractGeoFromHeaders(request);

    // Fire-and-forget: download events
    void (async () => {
      try {
        for (const file of allFiles) {
          await db.insert(promoDownloadEvents).values({
            promoDownloadId: file.id,
            creatorProfileId: download.creatorProfileId,
            email: parsed.data.email,
            ipAddress: ip,
            userAgent,
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
      userAgent
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
