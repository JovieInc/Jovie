import { serverFetch } from '@/lib/http/server-fetch';
import { ResendEmailProvider } from '@/lib/notifications/providers/resend';
import { logger } from '@/lib/utils/logger';
import {
  validateSubmissionImageAsset,
  validateXperiArtworkAttachment,
} from '../artifacts/attachment-validation';
import {
  buildSubmissionPackage,
  computeAttachmentChecksum,
} from '../artifacts/email-package';
import {
  buildXperiReleaseSheetAttachment,
  getXperiReferenceId,
} from '../artifacts/xperi-release-sheet';
import { diffSubmissionMonitoringData } from '../monitoring/diff';
import type {
  BuildContext,
  CanonicalSubmissionContext,
  SubmissionAttachment,
  SubmissionImageAsset,
  SubmissionProvider,
  SubmissionSendResult,
} from '../types';

const XPERI_RECIPIENT = 'content.music@xperi.com';

const emailProvider = new ResendEmailProvider();

function inferMimeTypeFromUrl(url: string): string {
  const normalized = url.toLowerCase();
  if (normalized.endsWith('.png')) {
    return 'image/png';
  }

  return 'image/jpeg';
}

function inferExtensionFromMimeType(mimeType: string): string {
  return mimeType === 'image/png' ? 'png' : 'jpg';
}

function buildArtworkAsset(
  canonical: CanonicalSubmissionContext
): SubmissionImageAsset | null {
  if (!canonical.release?.artworkUrl) {
    return null;
  }

  const mimeType = inferMimeTypeFromUrl(canonical.release.artworkUrl);
  const extension = inferExtensionFromMimeType(mimeType);
  const referenceId = getXperiReferenceId(canonical);

  return {
    kind: 'release_artwork',
    filename: `${referenceId}.${extension}`,
    mimeType,
    url: canonical.release.artworkUrl,
  };
}

function buildPressPhotoAttachments(
  canonical: CanonicalSubmissionContext
): SubmissionAttachment[] {
  return canonical.pressPhotos.map(photo => ({
    kind: photo.kind,
    filename: photo.filename,
    mimeType: photo.mimeType,
    blobUrl: photo.url,
    checksum: computeAttachmentChecksum(`${photo.filename}:${photo.url}`),
  }));
}

function buildBiographyAttachment(
  canonical: CanonicalSubmissionContext
): SubmissionAttachment | null {
  if (!canonical.artistBio?.trim()) {
    return null;
  }

  const contentBase64 = Buffer.from(canonical.artistBio, 'utf8').toString(
    'base64'
  );

  return {
    kind: 'artist_bio',
    filename: 'artist-biography.txt',
    mimeType: 'text/plain',
    contentBase64,
    checksum: computeAttachmentChecksum(contentBase64),
  };
}

async function materializeAttachment(
  attachment: SubmissionAttachment
): Promise<{ filename: string; content: string; contentType: string }> {
  if (attachment.contentBase64) {
    return {
      filename: attachment.filename,
      content: attachment.contentBase64,
      contentType: attachment.mimeType,
    };
  }

  if (!attachment.blobUrl) {
    throw new Error(`Attachment ${attachment.filename} has no content source`);
  }

  const response = await serverFetch(attachment.blobUrl, {
    context: `Metadata attachment download (${attachment.filename})`,
    timeoutMs: 10_000,
    retry: { maxRetries: 2, baseDelayMs: 250, maxDelayMs: 1000 },
  });

  if (!response.ok) {
    logger.warn('Attachment download failed', {
      filename: attachment.filename,
      status: response.status,
      statusText: response.statusText,
      url: attachment.blobUrl,
    });
    throw new Error(
      `Failed to download attachment ${attachment.filename}: ${response.status}`
    );
  }

  const arrayBuffer = await response.arrayBuffer();
  return {
    filename: attachment.filename,
    content: Buffer.from(arrayBuffer).toString('base64'),
    contentType: attachment.mimeType,
  };
}

async function buildAttachments(ctx: BuildContext): Promise<{
  attachments: SubmissionAttachment[];
  missingFields: Array<{ field: string; reason: string }>;
}> {
  const { canonical } = ctx;
  const missingFields: Array<{ field: string; reason: string }> = [];

  if (!canonical.release) {
    missingFields.push({
      field: 'release',
      reason: 'A release is required for Xperi submissions.',
    });
    return { attachments: [], missingFields };
  }

  if (canonical.tracks.length === 0) {
    missingFields.push({
      field: 'release_tracks',
      reason: 'At least one release track is required.',
    });
  }

  if (!canonical.artistName.trim()) {
    missingFields.push({
      field: 'artist_name',
      reason: 'Artist display name is missing.',
    });
  }

  if (!canonical.artistBio?.trim()) {
    missingFields.push({
      field: 'artist_bio',
      reason: 'Artist biography is required for the submission package.',
    });
  }

  if (!canonical.replyToEmail && !canonical.artistContactEmail) {
    missingFields.push({
      field: 'artist_contact_email',
      reason:
        'A reply-to email is required before Jovie can submit on the artist’s behalf.',
    });
  }

  const artwork = buildArtworkAsset(canonical);
  if (!artwork) {
    missingFields.push({
      field: 'release_artwork',
      reason: 'Release artwork is required for Xperi submissions.',
    });
  }

  if (missingFields.length > 0) {
    return { attachments: [], missingFields };
  }

  const validationIssues = [
    ...(artwork
      ? validateXperiArtworkAttachment(artwork, getXperiReferenceId(canonical))
      : []),
    ...canonical.pressPhotos.flatMap(validateSubmissionImageAsset),
  ];

  if (validationIssues.length > 0) {
    return {
      attachments: [],
      missingFields: validationIssues.map(issue => ({
        field: 'attachments',
        reason: issue,
      })),
    };
  }

  const attachments: SubmissionAttachment[] = [
    await buildXperiReleaseSheetAttachment(canonical),
    {
      kind: artwork!.kind,
      filename: artwork!.filename,
      mimeType: artwork!.mimeType,
      blobUrl: artwork!.url,
      checksum: computeAttachmentChecksum(
        `${artwork!.filename}:${artwork!.url}`
      ),
    },
    ...buildPressPhotoAttachments(canonical),
  ];

  const bioAttachment = buildBiographyAttachment(canonical);
  if (bioAttachment) {
    attachments.push(bioAttachment);
  }

  return { attachments, missingFields: [] };
}

async function sendPackage(
  packageData: ReturnType<typeof buildSubmissionPackage>,
  canonical: CanonicalSubmissionContext
): Promise<SubmissionSendResult> {
  const attachments = await Promise.all(
    packageData.attachments.map(materializeAttachment)
  );

  const result = await emailProvider.sendEmail({
    to: XPERI_RECIPIENT,
    subject: packageData.subject,
    text: packageData.text,
    html: packageData.html,
    replyTo:
      canonical.replyToEmail ?? canonical.artistContactEmail ?? undefined,
    attachments,
  });

  if (result.status !== 'sent') {
    return {
      status: 'failed',
      error: result.error ?? result.detail ?? 'Submission email failed',
    };
  }

  return {
    status: 'sent',
    providerMessageId: result.detail,
  };
}

export const xperiAllMusicProvider: SubmissionProvider = {
  id: 'xperi_allmusic_email',
  displayName: 'Xperi / AllMusic',
  transport: 'email',
  requiredInputs: [
    'artist_bio',
    'artist_name',
    'artist_contact_email',
    'release',
    'release_tracks',
    'release_artwork',
    'press_photos',
  ],
  async buildPackage(ctx) {
    const { canonical } = ctx;
    const { attachments, missingFields } = await buildAttachments(ctx);

    if (missingFields.length > 0 || !canonical.release) {
      return { package: null, missingFields };
    }

    const packageData = buildSubmissionPackage({
      canonical,
      subject: `Xperi Metadata Submission — ${canonical.artistName} — ${canonical.release.title}`,
      greeting: 'Hello Xperi Music Data Team,',
      bodyIntro:
        'Jovie is submitting a digital metadata package on behalf of the artist below. The release sheet, artwork, and supporting artist materials are attached for review.',
      attachments,
      monitoringBaseline: {
        artistName: canonical.artistName,
        releaseTitle: canonical.release.title,
        releaseDate: canonical.release.releaseDate
          ? canonical.release.releaseDate.toISOString().slice(0, 10)
          : null,
        upc: canonical.release.upc,
        trackCount: canonical.tracks.length,
        hasCredits: canonical.tracks.some(track => track.credits.length > 0),
        hasBio: Boolean(canonical.artistBio?.trim()),
        hasArtistImage: canonical.pressPhotos.length > 0,
        hasArtwork: Boolean(canonical.release.artworkUrl),
      },
    });

    return {
      package: packageData,
      missingFields: [],
    };
  },
  async send(ctx) {
    return sendPackage(ctx.package, ctx.canonical);
  },
  diff(baseline, live) {
    return diffSubmissionMonitoringData(baseline, live);
  },
};
