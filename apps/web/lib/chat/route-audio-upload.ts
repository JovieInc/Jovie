import { and, eq } from 'drizzle-orm';
import { revalidateTag } from 'next/cache';
import {
  isSupportedAudioMimeType,
  validateAudioFile,
} from '@/lib/audio/constants';
import { createSmartLinkContentTag } from '@/lib/cache/tags';
import {
  type AudioEntityInference,
  buildAudioUploadPrompt,
  inferAudioEntity,
} from '@/lib/chat/infer-audio-entity';
import { db } from '@/lib/db';
import {
  discogRecordings,
  discogReleases,
  discogReleaseTracks,
} from '@/lib/db/schema/content';
import {
  getReleasesForProfile,
  upsertRecording,
  upsertRelease,
  upsertReleaseTrack,
} from '@/lib/discography/queries';
import { generateUniqueSlug } from '@/lib/discography/slug';

export interface RouteChatAudioUploadInput {
  readonly clerkUserId: string;
  readonly profileId: string;
  readonly blobUrl: string;
  readonly blobPathname: string;
  readonly fileName: string;
  readonly fileMimeType: string;
  readonly fileSizeBytes?: number;
}

export interface RouteChatAudioUploadResult {
  readonly inference: AudioEntityInference;
  readonly releaseId: string;
  readonly releaseTitle: string;
  readonly previewUrl: string;
  readonly prompt: string;
}

async function releaseHasAudio(releaseId: string): Promise<boolean> {
  const [row] = await db
    .select({ previewUrl: discogRecordings.previewUrl })
    .from(discogReleaseTracks)
    .innerJoin(
      discogRecordings,
      eq(discogRecordings.id, discogReleaseTracks.recordingId)
    )
    .where(eq(discogReleaseTracks.releaseId, releaseId))
    .orderBy(discogReleaseTracks.discNumber, discogReleaseTracks.trackNumber)
    .limit(1);

  return Boolean(row?.previewUrl);
}

async function attachAudioToRelease({
  profileId,
  releaseId,
  blobUrl,
  fileMimeType,
}: {
  readonly profileId: string;
  readonly releaseId: string;
  readonly blobUrl: string;
  readonly fileMimeType: string;
}): Promise<void> {
  const [row] = await db
    .select({
      recordingId: discogRecordings.id,
      currentPreviewUrl: discogRecordings.previewUrl,
    })
    .from(discogReleases)
    .innerJoin(
      discogReleaseTracks,
      eq(discogReleaseTracks.releaseId, discogReleases.id)
    )
    .innerJoin(
      discogRecordings,
      eq(discogRecordings.id, discogReleaseTracks.recordingId)
    )
    .where(
      and(
        eq(discogReleases.id, releaseId),
        eq(discogReleases.creatorProfileId, profileId)
      )
    )
    .orderBy(discogReleaseTracks.discNumber, discogReleaseTracks.trackNumber)
    .limit(1);

  if (!row) {
    throw new Error('Release recording not found');
  }

  if (row.currentPreviewUrl) {
    throw new Error('Release already has audio');
  }

  await db
    .update(discogRecordings)
    .set({
      previewUrl: blobUrl,
      audioUrl: blobUrl,
      audioFormat: fileMimeType,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(discogRecordings.id, row.recordingId),
        eq(discogRecordings.creatorProfileId, profileId)
      )
    );
}

async function createDraftSingleWithAudio({
  profileId,
  title,
  blobUrl,
  fileMimeType,
}: {
  readonly profileId: string;
  readonly title: string;
  readonly blobUrl: string;
  readonly fileMimeType: string;
}): Promise<{ releaseId: string; releaseTitle: string }> {
  const releaseSlug = await generateUniqueSlug(profileId, title, 'release');
  const release = await upsertRelease({
    creatorProfileId: profileId,
    title,
    slug: releaseSlug,
    releaseType: 'single',
    totalTracks: 1,
    sourceType: 'manual',
    metadata: {
      chatAudioUpload: true,
    },
  });

  const recordingSlug = await generateUniqueSlug(profileId, title, 'track');
  const recording = await upsertRecording({
    creatorProfileId: profileId,
    title,
    slug: recordingSlug,
    previewUrl: blobUrl,
    audioUrl: blobUrl,
    audioFormat: fileMimeType,
    sourceType: 'manual',
    metadata: {
      chatAudioUpload: true,
    },
  });

  const trackSlug = await generateUniqueSlug(profileId, title, 'track');
  await upsertReleaseTrack({
    releaseId: release.id,
    recordingId: recording.id,
    title,
    slug: trackSlug,
    trackNumber: 1,
    sourceType: 'manual',
  });

  return {
    releaseId: release.id,
    releaseTitle: release.title,
  };
}

async function storeReferenceAudio({
  profileId,
  title,
  blobUrl,
  fileMimeType,
  releaseId,
}: {
  readonly profileId: string;
  readonly title: string;
  readonly blobUrl: string;
  readonly fileMimeType: string;
  readonly releaseId: string;
}): Promise<void> {
  const recordingSlug = await generateUniqueSlug(
    profileId,
    `${title}-reference`,
    'track'
  );

  await upsertRecording({
    creatorProfileId: profileId,
    title: `${title} (reference)`,
    slug: recordingSlug,
    previewUrl: blobUrl,
    audioUrl: blobUrl,
    audioFormat: fileMimeType,
    sourceType: 'manual',
    metadata: {
      chatAudioUpload: true,
      referenceForReleaseId: releaseId,
    },
  });
}

export async function routeChatAudioUpload(
  input: RouteChatAudioUploadInput
): Promise<RouteChatAudioUploadResult> {
  const validationError = validateAudioFile({
    name: input.fileName,
    type: input.fileMimeType,
    size: input.fileSizeBytes ?? 1,
  });

  if (validationError) {
    throw new Error(validationError);
  }

  if (!isSupportedAudioMimeType(input.fileMimeType)) {
    throw new Error('Unsupported audio file type');
  }

  const releases = await getReleasesForProfile(input.profileId, {
    includeDrafts: true,
  });

  const catalog = await Promise.all(
    releases.map(async release => ({
      id: release.id,
      title: release.title,
      hasAudio: await releaseHasAudio(release.id),
    }))
  );

  const inference = inferAudioEntity({
    fileName: input.fileName,
    catalog,
  });

  let releaseId = inference.releaseId;
  let releaseTitle = inference.releaseTitle ?? inference.suggestedTitle;

  if (inference.kind === 'attach-to-existing' && releaseId) {
    await attachAudioToRelease({
      profileId: input.profileId,
      releaseId,
      blobUrl: input.blobUrl,
      fileMimeType: input.fileMimeType,
    });
  } else if (inference.kind === 'reference' && releaseId) {
    await storeReferenceAudio({
      profileId: input.profileId,
      title: inference.suggestedTitle,
      blobUrl: input.blobUrl,
      fileMimeType: input.fileMimeType,
      releaseId,
    });
  } else {
    const created = await createDraftSingleWithAudio({
      profileId: input.profileId,
      title: inference.suggestedTitle,
      blobUrl: input.blobUrl,
      fileMimeType: input.fileMimeType,
    });
    releaseId = created.releaseId;
    releaseTitle = created.releaseTitle;
  }

  revalidateTag(`releases:${input.clerkUserId}:${input.profileId}`, 'max');
  revalidateTag(createSmartLinkContentTag(input.profileId), 'max');

  const prompt = buildAudioUploadPrompt({
    fileName: input.fileName,
    inference,
    previewUrl: input.blobUrl,
  });

  return {
    inference,
    releaseId,
    releaseTitle,
    previewUrl: input.blobUrl,
    prompt,
  };
}
