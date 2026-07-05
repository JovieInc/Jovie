import { parseAudioTitleFromFileName } from '@/lib/audio/constants';

export type AudioEntityInferenceKind =
  | 'attach-to-existing'
  | 'new-track'
  | 'reference';

export type AudioEntityInferenceConfidence = 'high' | 'low';

export interface AudioCatalogRelease {
  readonly id: string;
  readonly title: string;
  readonly hasAudio: boolean;
}

export interface AudioEntityInference {
  readonly kind: AudioEntityInferenceKind;
  readonly confidence: AudioEntityInferenceConfidence;
  readonly suggestedTitle: string;
  readonly releaseId: string | null;
  readonly releaseTitle: string | null;
  readonly matchScore: number;
}

function normalizeTitle(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function tokenOverlapScore(left: string, right: string): number {
  const leftTokens = new Set(normalizeTitle(left).split(' ').filter(Boolean));
  const rightTokens = new Set(normalizeTitle(right).split(' ').filter(Boolean));

  if (leftTokens.size === 0 || rightTokens.size === 0) {
    return 0;
  }

  let overlap = 0;
  for (const token of leftTokens) {
    if (rightTokens.has(token)) {
      overlap += 1;
    }
  }

  return overlap / Math.max(leftTokens.size, rightTokens.size);
}

function titleMatchScore(fileTitle: string, releaseTitle: string): number {
  const normalizedFileTitle = normalizeTitle(fileTitle);
  const normalizedReleaseTitle = normalizeTitle(releaseTitle);

  if (!normalizedFileTitle || !normalizedReleaseTitle) {
    return 0;
  }

  if (normalizedFileTitle === normalizedReleaseTitle) {
    return 1;
  }

  if (
    normalizedFileTitle.includes(normalizedReleaseTitle) ||
    normalizedReleaseTitle.includes(normalizedFileTitle)
  ) {
    return 0.92;
  }

  return tokenOverlapScore(normalizedFileTitle, normalizedReleaseTitle);
}

export function inferAudioEntity({
  fileName,
  catalog,
}: {
  readonly fileName: string;
  readonly catalog: readonly AudioCatalogRelease[];
}): AudioEntityInference {
  const suggestedTitle = parseAudioTitleFromFileName(fileName);

  let bestMatch: {
    release: AudioCatalogRelease;
    score: number;
  } | null = null;

  for (const release of catalog) {
    const score = titleMatchScore(suggestedTitle, release.title);
    if (!bestMatch || score > bestMatch.score) {
      bestMatch = { release, score };
    }
  }

  if (bestMatch && bestMatch.score >= 0.75) {
    if (!bestMatch.release.hasAudio) {
      return {
        kind: 'attach-to-existing',
        confidence: bestMatch.score >= 0.9 ? 'high' : 'low',
        suggestedTitle,
        releaseId: bestMatch.release.id,
        releaseTitle: bestMatch.release.title,
        matchScore: bestMatch.score,
      };
    }

    return {
      kind: 'reference',
      confidence: bestMatch.score >= 0.9 ? 'high' : 'low',
      suggestedTitle,
      releaseId: bestMatch.release.id,
      releaseTitle: bestMatch.release.title,
      matchScore: bestMatch.score,
    };
  }

  return {
    kind: 'new-track',
    confidence: 'low',
    suggestedTitle,
    releaseId: null,
    releaseTitle: null,
    matchScore: bestMatch?.score ?? 0,
  };
}

export function buildAudioUploadPrompt({
  fileName,
  inference,
  previewUrl,
}: {
  readonly fileName: string;
  readonly inference: AudioEntityInference;
  readonly previewUrl: string;
}): string {
  const title = inference.suggestedTitle;

  if (inference.kind === 'attach-to-existing' && inference.releaseTitle) {
    return [
      `I uploaded "${fileName}" for my track "${title}".`,
      `Jovie matched it to the release "${inference.releaseTitle}" and attached the audio.`,
      `Preview: ${previewUrl}`,
      'What should I do next to get this release ready?',
    ].join(' ');
  }

  if (inference.kind === 'reference' && inference.releaseTitle) {
    return [
      `I uploaded "${fileName}" as a reference for "${title}".`,
      `It looks related to my existing release "${inference.releaseTitle}", which already has audio.`,
      `Stored preview: ${previewUrl}`,
      'How should I use this reference in my release plan?',
    ].join(' ');
  }

  return [
    `I uploaded "${fileName}" for a new track called "${title}".`,
    `Jovie created a draft single and attached the audio.`,
    `Preview: ${previewUrl}`,
    'What should I do next to plan this release?',
  ].join(' ');
}
