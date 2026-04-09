import type {
  ExtensionAvailableTarget,
  ExtensionBlocker,
  ExtensionFieldMapping,
  ExtensionFillPreviewRequest,
  ExtensionFillPreviewResponse,
  ExtensionSubmissionPacket,
  ExtensionTargetKey,
} from '@jovie/extension-contracts';
import { APP_ROUTES } from '@/constants/routes';
import { getReleaseById } from '@/lib/discography/queries';

const REQUIRED_TARGETS = new Set<ExtensionTargetKey>([
  'release_title',
  'artist_name',
  'release_date',
  'primary_genre',
]);

const RELEASE_TARGET_KEYS = new Set<ExtensionTargetKey>([
  'release_title',
  'artist_name',
  'release_date',
  'upc',
  'primary_genre',
  'secondary_genre',
  'label_name',
]);

function formatDateForForm(value: string | Date | null | undefined) {
  if (!value) return null;
  const date = typeof value === 'string' ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString().slice(0, 10);
}

function buildFixUrl(releaseId: string) {
  const search = new URLSearchParams({ releaseId });
  return `${APP_ROUTES.RELEASES}?${search.toString()}`;
}

function buildSubmissionPacket(params: {
  releaseTitle: string;
  artistName: string;
  releaseDate: string | null;
  upc: string | null;
  genres: readonly string[];
  labelName: string | null;
}): ExtensionSubmissionPacket {
  return {
    title: `Manual Submission Packet: ${params.releaseTitle}`,
    summary:
      'This alpha fallback includes the release-level metadata Jovie can verify right now.',
    sections: [
      {
        id: 'release',
        title: 'Release Metadata',
        lines: [
          { label: 'Release Title', value: params.releaseTitle },
          { label: 'Artist Name', value: params.artistName },
          {
            label: 'Release Date',
            value: params.releaseDate ?? 'Missing In Jovie',
          },
          { label: 'UPC', value: params.upc ?? 'Auto-Generate In DistroKid' },
          {
            label: 'Primary Genre',
            value: params.genres[0] ?? 'Missing In Jovie',
          },
          { label: 'Secondary Genre', value: params.genres[1] ?? 'Not Set' },
          { label: 'Label Name', value: params.labelName ?? 'Not Set' },
        ],
      },
    ],
  };
}

function getSourceValue(
  targetKey: ExtensionTargetKey,
  params: {
    releaseTitle: string;
    artistName: string;
    releaseDate: string | null;
    upc: string | null;
    genres: readonly string[];
    labelName: string | null;
  }
) {
  switch (targetKey) {
    case 'release_title':
      return { sourceKey: 'release.title', value: params.releaseTitle };
    case 'artist_name':
      return { sourceKey: 'release.artistNames', value: params.artistName };
    case 'release_date':
      return { sourceKey: 'release.releaseDate', value: params.releaseDate };
    case 'upc':
      return { sourceKey: 'release.upc', value: params.upc };
    case 'primary_genre':
      return {
        sourceKey: 'release.genres[0]',
        value: params.genres[0] ?? null,
      };
    case 'secondary_genre':
      return {
        sourceKey: 'release.genres[1]',
        value: params.genres[1] ?? null,
      };
    case 'label_name':
      return { sourceKey: 'release.label', value: params.labelName };
    default:
      return null;
  }
}

export async function buildExtensionFillPreview(
  request: ExtensionFillPreviewRequest,
  profileId: string
): Promise<ExtensionFillPreviewResponse | null> {
  const release = await getReleaseById(request.entityId);
  if (!release || release.creatorProfileId !== profileId) return null;

  const releaseTitle = release.title.trim();
  const artistName =
    release.artistNames?.filter(Boolean).join(', ').trim() || 'Unknown Artist';
  const releaseDate = formatDateForForm(release.releaseDate);
  const genres = release.genres ?? [];
  const labelName = release.label?.trim() || null;
  const upc = release.upc?.trim() || null;
  const fixUrl = buildFixUrl(release.id);
  const submissionPacket = buildSubmissionPacket({
    releaseTitle,
    artistName,
    releaseDate,
    upc,
    genres,
    labelName,
  });

  if (
    request.pageVariant !== 'release_form_v1' ||
    request.availableTargets.length === 0
  ) {
    return {
      status: 'fallback',
      workflowId: 'distrokid_release_form',
      entityId: release.id,
      entityTitle: release.title,
      mappings: [],
      blockers: [],
      unsupportedTargets: request.availableTargets,
      submissionPacket,
    };
  }

  const blockers: ExtensionBlocker[] = [];
  const unsupportedTargets: ExtensionAvailableTarget[] = [];
  const mappings: ExtensionFieldMapping[] = request.availableTargets.map(
    target => {
      if (!RELEASE_TARGET_KEYS.has(target.targetKey)) {
        unsupportedTargets.push(target);
        return {
          targetId: target.targetId,
          targetKey: target.targetKey,
          targetLabel: target.targetLabel,
          groupIndex: target.groupIndex,
          sourceKey: target.targetKey,
          value: '',
          required: false,
          confidence: 'unsupported',
          status: 'unsupported',
          reason: 'Track-row and fallback-only targets land in the next slice.',
        };
      }

      const source = getSourceValue(target.targetKey, {
        releaseTitle,
        artistName,
        releaseDate,
        upc,
        genres,
        labelName,
      });

      if (!source?.value) {
        if (REQUIRED_TARGETS.has(target.targetKey)) {
          blockers.push({
            code: source?.sourceKey ?? target.targetKey,
            label: target.targetLabel,
            message: `${target.targetLabel} is required in Jovie before this DistroKid form can be shipped.`,
            fixUrl,
          });
          return {
            targetId: target.targetId,
            targetKey: target.targetKey,
            targetLabel: target.targetLabel,
            sourceKey: source?.sourceKey ?? target.targetKey,
            value: '',
            required: true,
            confidence: 'derived',
            status: 'blocked',
            reason: `${target.targetLabel} is missing in Jovie.`,
          };
        }

        unsupportedTargets.push(target);
        return {
          targetId: target.targetId,
          targetKey: target.targetKey,
          targetLabel: target.targetLabel,
          sourceKey: source?.sourceKey ?? target.targetKey,
          value: '',
          required: false,
          confidence: 'unsupported',
          status: 'unsupported',
          reason: `${target.targetLabel} is not set in Jovie yet.`,
        };
      }

      return {
        targetId: target.targetId,
        targetKey: target.targetKey,
        targetLabel: target.targetLabel,
        sourceKey: source.sourceKey,
        value: source.value,
        required: REQUIRED_TARGETS.has(target.targetKey),
        confidence: 'exact',
        status: 'ready',
      };
    }
  );

  return {
    status: blockers.length ? 'blocked' : 'ready',
    workflowId: 'distrokid_release_form',
    entityId: release.id,
    entityTitle: release.title,
    mappings,
    blockers,
    unsupportedTargets,
    submissionPacket,
  };
}
