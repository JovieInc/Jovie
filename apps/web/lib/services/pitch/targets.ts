import { serializeEntity, serializeSkill } from '@/lib/chat/tokens';

export const PITCH_TARGETS = [
  'playlist',
  'radio',
  'sirius_xm',
  'install',
  'playback',
  'editorial_post',
  'record_label',
  'collaborator',
] as const;

export type PitchTarget = (typeof PITCH_TARGETS)[number];

export const PITCH_PLATFORMS = [
  'spotify',
  'apple_music',
  'amazon_music',
  'music_supervisor',
] as const;

export type PitchPlatform = (typeof PITCH_PLATFORMS)[number];

export interface PitchDestination {
  readonly target: PitchTarget;
  readonly platform: PitchPlatform | null;
  readonly label: string;
  readonly audience: string;
  readonly guidance: string;
  readonly characterLimit: number;
}

export const PITCH_TARGET_OPTION_LABELS: Record<PitchTarget, string> = {
  playlist: 'Playlist',
  radio: 'Radio',
  sirius_xm: 'Sirius XM',
  install: 'Install',
  playback: 'Playback',
  editorial_post: 'Editorial posts',
  record_label: 'Record labels',
  collaborator: 'Collaborators',
};

export const PITCH_TARGET_OPTIONS_TEXT = PITCH_TARGETS.map(
  target => PITCH_TARGET_OPTION_LABELS[target]
).join(', ');

const TARGET_CONFIG: Record<
  PitchTarget,
  Pick<PitchDestination, 'audience' | 'guidance' | 'characterLimit'>
> = {
  playlist: {
    audience: 'streaming editorial or independent playlist curator',
    guidance:
      'Lead with release story, sonic fit, mood, and why this belongs in a specific playlist context.',
    characterLimit: 500,
  },
  radio: {
    audience: 'radio programmer or music director',
    guidance:
      'Focus on clean programming fit, local or audience relevance, release timing, and a concise reason to add it.',
    characterLimit: 900,
  },
  sirius_xm: {
    audience: 'Sirius XM programmer',
    guidance:
      'Map the release to a channel, show, mood, or listener lane and keep it specific enough for satellite radio programming.',
    characterLimit: 900,
  },
  install: {
    audience: 'brand, venue, retail, or installation programming contact',
    guidance:
      'Explain the experiential fit, atmosphere, audience, and why the track works in the physical environment.',
    characterLimit: 900,
  },
  playback: {
    audience: 'music supervisor, sync, or playback placement contact',
    guidance:
      'Describe scene fit, emotional use case, tempo or mood, vocal/instrumental utility, and clearance-friendly facts only when provided.',
    characterLimit: 900,
  },
  editorial_post: {
    audience: 'editorial, blog, newsletter, or social content editor',
    guidance:
      'Give the editor a clear angle, headline-worthy story, and concise context they can turn into a post.',
    characterLimit: 1200,
  },
  record_label: {
    audience: 'record label A&R or label partner',
    guidance:
      'Frame artist trajectory, release momentum, market lane, and partnership fit without inventing numbers.',
    characterLimit: 1200,
  },
  collaborator: {
    audience: 'potential collaborator, producer, writer, or featured artist',
    guidance:
      'Make the creative invitation concrete: why them, what the release needs, and the lowest-friction next step.',
    characterLimit: 900,
  },
};

const PLATFORM_LABELS: Record<PitchPlatform, string> = {
  spotify: 'Spotify',
  apple_music: 'Apple Music',
  amazon_music: 'Amazon Music',
  music_supervisor: 'Music supervisor',
};

function normalizeText(value: string): string {
  return value.toLowerCase().replaceAll(/[_-]+/g, ' ');
}

export function normalizePitchTarget(
  value: string | null | undefined
): PitchTarget | null {
  if (!value) return null;
  const normalized = normalizeText(value);

  if (/\bsirius\s*xm\b|\bsxm\b/.test(normalized)) return 'sirius_xm';
  if (/\brecord label\b|\blabel\b|\ba&r\b|\bpartner\b/.test(normalized)) {
    return 'record_label';
  }
  if (
    /\bcollab|\bcollaborator|\bproducer\b|\bwriter\b|\bfeature\b/.test(
      normalized
    )
  ) {
    return 'collaborator';
  }
  if (
    /\bmusic supervisor\b|\bsync\b|\bplayback\b|\bfilm\b|\btv\b|\bad\b/.test(
      normalized
    )
  ) {
    return 'playback';
  }
  if (
    /\binstall\b|\binstallation\b|\bin store\b|\bin-store\b|\bretail\b|\bvenue\b/.test(
      normalized
    )
  ) {
    return 'install';
  }
  if (/\bradio\b|\bstation\b|\bprogrammer\b/.test(normalized)) return 'radio';
  if (
    /\bpost\b|\bblog\b|\bnewsletter\b|\bpress\b|\beditorial post\b/.test(
      normalized
    )
  ) {
    return 'editorial_post';
  }
  if (
    /\bplaylist\b|\bspotify\b|\bapple music\b|\bamazon music\b|\beditorial\b|\bpitch\b|\bpitching\b/.test(
      normalized
    )
  ) {
    return 'playlist';
  }

  return null;
}

export function normalizePitchPlatform(
  value: string | null | undefined
): PitchPlatform | null {
  if (!value) return null;
  const normalized = normalizeText(value);
  if (/\bspotify\b/.test(normalized)) return 'spotify';
  if (/\bapple\b/.test(normalized)) return 'apple_music';
  if (/\bamazon\b/.test(normalized)) return 'amazon_music';
  if (/\bsupervisor\b|\bsync\b|\bplayback\b/.test(normalized)) {
    return 'music_supervisor';
  }
  return null;
}

export function inferPitchDestinationFromText(
  text: string | null | undefined
): Pick<PitchDestination, 'target' | 'platform'> | null {
  if (!text) return null;
  const target = normalizePitchTarget(text);
  if (!target) return null;

  const platform = normalizePitchPlatform(text);
  return {
    target,
    platform: target === 'playlist' || target === 'playback' ? platform : null,
  };
}

export function isPitchRelatedText(text: string | null | undefined): boolean {
  return inferPitchDestinationFromText(text) !== null;
}

export function resolvePitchDestination(params: {
  readonly target?: string | null;
  readonly platform?: string | null;
  readonly taskTitle?: string | null;
  readonly taskCategory?: string | null;
  readonly instructions?: string | null;
}): PitchDestination | null {
  const explicitTarget = normalizePitchTarget(params.target);
  const explicitPlatform = normalizePitchPlatform(params.platform);
  const inferred =
    explicitTarget === null
      ? inferPitchDestinationFromText(
          [
            params.taskTitle,
            params.taskCategory,
            params.instructions,
            params.platform,
          ]
            .filter(Boolean)
            .join(' ')
        )
      : null;

  const target = explicitTarget ?? inferred?.target ?? null;
  if (!target) return null;

  const platform =
    explicitPlatform ??
    (target === 'playlist' || target === 'playback'
      ? (inferred?.platform ?? null)
      : null);
  const config = TARGET_CONFIG[target];
  const targetLabel = PITCH_TARGET_OPTION_LABELS[target];
  const platformLabel = platform ? PLATFORM_LABELS[platform] : null;

  return {
    target,
    platform,
    label: platformLabel
      ? `${platformLabel} ${targetLabel.toLowerCase()}`
      : targetLabel,
    ...config,
  };
}

export function buildReleasePitchChatPrompt(params: {
  readonly releaseId: string;
  readonly releaseTitle: string;
}): string {
  return [
    `Generate a pitch for ${serializeEntity({
      kind: 'release',
      id: params.releaseId,
      label: params.releaseTitle,
    })}.`,
    `Ask me where I want to pitch it before generating unless I already specify one of these destinations: ${PITCH_TARGET_OPTIONS_TEXT}.`,
  ].join('\n');
}

export function buildTaskPitchChatPrompt(params: {
  readonly releaseId: string;
  readonly releaseTitle: string;
  readonly taskTitle: string;
  readonly taskCategory?: string | null;
}): string {
  return [
    `${serializeSkill('generateReleasePitch')} ${serializeEntity({
      kind: 'release',
      id: params.releaseId,
      label: params.releaseTitle,
    })}`,
    'Generate the pitch for this release task.',
    JSON.stringify({
      releaseId: params.releaseId,
      releaseTitle: params.releaseTitle,
      taskTitle: params.taskTitle,
      taskCategory: params.taskCategory ?? null,
      instruction:
        'Infer the destination from the task when possible. Ask me where to pitch it only when the task does not clearly map to a destination.',
    }),
  ].join('\n');
}
