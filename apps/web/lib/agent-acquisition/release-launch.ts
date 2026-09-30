import 'server-only';

import { createHash } from 'node:crypto';
import { BASE_URL } from '@/constants/app';
import {
  type AgentAcquisition,
  type PrepareReleaseLaunchInput,
  prepareReleaseLaunchSchema,
} from './draft-contract';
import type { StoredReleaseLaunch } from './draft-preview';
import {
  loadAgentDraftForMutation,
  storeAgentReleaseLaunch,
} from './draft-store';
import { type ReleaseFacts, resolveAgentRelease } from './release-resolution';

type ScalarField =
  | 'content_type'
  | 'title'
  | 'artist_name'
  | 'release_date'
  | 'upc';

export interface ReleaseFactConflict {
  readonly field: string;
  readonly values: ReadonlyArray<{
    readonly source: string;
    readonly value: string;
  }>;
}

export interface ReleaseLaunchResult {
  readonly status: 'launch_draft_ready' | 'draft_needs_input';
  readonly next_action: 'review_draft' | 'provide_release_facts';
  readonly draft_id: string;
  readonly receipt_id: string;
  readonly status_url: string;
  readonly expires_at: string;
  readonly ownership: 'unverified';
  readonly published_url: null;
  readonly claim_url: null;
  readonly acquisition: AgentAcquisition & { readonly draft_id: string };
  readonly goal: string;
  readonly release: {
    readonly content_type: 'album' | 'track' | null;
    readonly title: string | null;
    readonly artist_name: string | null;
    readonly release_date: string | null;
    readonly artwork_url: string | null;
    readonly upc: string | null;
    readonly dsp_links: Readonly<Record<string, string>>;
  };
  readonly visibility_page: {
    readonly state: 'draft';
    readonly url: null;
    readonly headline: string;
    readonly description: string;
  };
  readonly release_page: {
    readonly state: 'draft';
    readonly url: null;
    readonly headline: string | null;
    readonly description: string | null;
  };
  readonly smart_link: {
    readonly state: 'draft';
    readonly url: null;
    readonly headline: string | null;
    readonly links: Readonly<Record<string, string>>;
  };
  readonly missing_fields: readonly string[];
  readonly conflicts: readonly ReleaseFactConflict[];
  readonly questions: ReadonlyArray<{
    readonly field: string;
    readonly prompt: string;
  }>;
  readonly warnings: readonly string[];
  readonly retryable: false;
}

function comparable(field: ScalarField, value: string): string {
  if (field === 'release_date' || field === 'upc') return value;
  return value
    .normalize('NFKD')
    .replaceAll(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replaceAll(/[^a-z0-9]+/g, ' ')
    .trim();
}

function scalar(
  facts: readonly ReleaseFacts[],
  field: ScalarField,
  conflicts: ReleaseFactConflict[]
): string | null {
  const values = facts.flatMap(fact => {
    const value = fact[field];
    return value ? [{ source: fact.source, value }] : [];
  });
  const distinct = new Map<string, (typeof values)[number]>();
  for (const value of values) {
    distinct.set(comparable(field, value.value), value);
  }
  if (distinct.size > 1) {
    conflicts.push({ field, values });
    return null;
  }
  return values[0]?.value ?? null;
}

function comparableUrl(value: string): string {
  const url = new URL(value);
  url.hash = '';
  url.search = '';
  return url.href.replace(/\/$/, '');
}

function artwork(
  facts: readonly ReleaseFacts[],
  conflicts: ReleaseFactConflict[]
): string | null {
  const values = facts.flatMap(fact =>
    fact.artwork_url ? [{ source: fact.source, value: fact.artwork_url }] : []
  );
  if (new Set(values.map(value => comparableUrl(value.value))).size > 1) {
    conflicts.push({ field: 'artwork_url', values });
    return null;
  }
  return values[0]?.value ?? null;
}

function mergeLinks(
  facts: readonly ReleaseFacts[],
  conflicts: ReleaseFactConflict[]
): Record<string, string> {
  const byProvider = new Map<
    string,
    Array<{ source: string; value: string }>
  >();
  for (const fact of facts) {
    for (const [provider, value] of Object.entries(fact.dsp_links)) {
      const links = byProvider.get(provider) ?? [];
      links.push({ source: fact.source, value });
      byProvider.set(provider, links);
    }
  }
  const merged: Record<string, string> = {};
  for (const [provider, values] of byProvider) {
    const distinct = new Set(values.map(value => comparableUrl(value.value)));
    if (distinct.size > 1) {
      conflicts.push({ field: `dsp_links.${provider}`, values });
    } else if (values[0]) {
      merged[provider] = values[0].value;
    }
  }
  return merged;
}

function artistIdentityConflict(
  artist: {
    readonly provider: string;
    readonly external_id: string;
    readonly display_name: string;
  },
  facts: readonly ReleaseFacts[]
): ReleaseFactConflict | null {
  for (const fact of facts) {
    const providerId = fact.artist_ids[artist.provider];
    if (providerId && providerId !== artist.external_id) {
      return {
        field: 'artist_identity',
        values: [
          { source: 'artist_draft', value: artist.external_id },
          { source: fact.source, value: providerId },
        ],
      };
    }
  }
  const draftName = comparable('artist_name', artist.display_name);
  const releaseNames = facts
    .filter(fact => fact.artist_name)
    .map(fact => ({
      source: fact.source,
      value: fact.artist_name!,
      normalized: comparable('artist_name', fact.artist_name!),
    }));
  const mismatch = releaseNames.find(
    value =>
      !value.normalized.includes(draftName) &&
      !draftName.includes(value.normalized)
  );
  return mismatch
    ? {
        field: 'artist_identity',
        values: [
          { source: 'artist_draft', value: artist.display_name },
          { source: mismatch.source, value: mismatch.value },
        ],
      }
    : null;
}

const missingPrompts: Record<string, string> = {
  title: 'What is the release title?',
  artist_name: 'Which artist name should this release use?',
  artwork_url: 'What HTTPS artwork URL should the draft use?',
  release_date: 'What is the release date in YYYY-MM-DD format?',
  dsp_links: 'Share at least one confirmed DSP release link.',
};

function draftResult(
  input: PrepareReleaseLaunchInput,
  row: NonNullable<Awaited<ReturnType<typeof loadAgentDraftForMutation>>>,
  facts: readonly ReleaseFacts[]
): ReleaseLaunchResult {
  const conflicts: ReleaseFactConflict[] = [];
  const contentType = scalar(facts, 'content_type', conflicts) as
    | 'album'
    | 'track'
    | null;
  const title = scalar(facts, 'title', conflicts);
  const artistName = scalar(facts, 'artist_name', conflicts);
  const releaseDate = scalar(facts, 'release_date', conflicts);
  const resolvedUpc = scalar(facts, 'upc', conflicts);
  const artworkUrl = artwork(facts, conflicts);
  const dspLinks = mergeLinks(facts, conflicts);
  const artistConflict = artistIdentityConflict(row.preview, facts);
  if (artistConflict) conflicts.push(artistConflict);
  const conflictFields = new Set(conflicts.map(conflict => conflict.field));
  const missingFields = [
    !title && !conflictFields.has('title') && 'title',
    !artistName && !conflictFields.has('artist_name') && 'artist_name',
    !artworkUrl && !conflictFields.has('artwork_url') && 'artwork_url',
    !releaseDate && !conflictFields.has('release_date') && 'release_date',
    Object.keys(dspLinks).length === 0 &&
      ![...conflictFields].some(field => field.startsWith('dsp_links.')) &&
      'dsp_links',
  ].filter((value): value is string => Boolean(value));
  const questions = [
    ...missingFields.map(field => ({ field, prompt: missingPrompts[field]! })),
    ...conflicts.map(conflict => ({
      field: conflict.field,
      prompt: `Which ${conflict.field.replaceAll(/[._]/g, ' ')} is correct?`,
    })),
  ];
  const needsInput = questions.length > 0;
  const headline = title && artistName ? `${title} by ${artistName}` : null;
  return {
    status: needsInput ? 'draft_needs_input' : 'launch_draft_ready',
    next_action: needsInput ? 'provide_release_facts' : 'review_draft',
    draft_id: row.id,
    receipt_id: row.id,
    status_url: `${BASE_URL}/api/agents/drafts/${row.id}`,
    expires_at: row.expiresAt.toISOString(),
    ownership: 'unverified',
    published_url: null,
    claim_url: null,
    acquisition: { ...row.acquisition, draft_id: row.id },
    goal: input.goal,
    release: {
      content_type: contentType,
      title,
      artist_name: artistName,
      release_date: releaseDate,
      artwork_url: artworkUrl,
      upc: resolvedUpc,
      dsp_links: dspLinks,
    },
    visibility_page: {
      state: 'draft',
      url: null,
      headline: row.preview.display_name,
      description: `Music, releases, and listening links for ${row.preview.display_name}.`,
    },
    release_page: {
      state: 'draft',
      url: null,
      headline,
      description: headline
        ? `${headline}. Choose a music service to listen.`
        : null,
    },
    smart_link: {
      state: 'draft',
      url: null,
      headline: title ? `Listen to ${title}` : null,
      links: dspLinks,
    },
    missing_fields: missingFields,
    conflicts,
    questions,
    warnings: [
      'This draft is unpublished. Human ownership verification and approval are required before publication.',
    ],
    retryable: false,
  };
}

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record)
      .sort()
      .map(key => `${JSON.stringify(key)}:${canonical(record[key])}`)
      .join(',')}}`;
  }
  return JSON.stringify(value) ?? 'null';
}

function fingerprint(input: PrepareReleaseLaunchInput): string {
  const { draft_token: _token, ...publicInput } = input;
  return createHash('sha256').update(canonical(publicInput)).digest('hex');
}

const unavailable = () => ({
  status: 'error' as const,
  code: 'DRAFT_UNAVAILABLE' as const,
  next_action: 'artist.search_or_import' as const,
  retryable: false,
});

export async function prepareReleaseLaunch(input: unknown) {
  const parsed = prepareReleaseLaunchSchema.safeParse(input);
  if (!parsed.success)
    return {
      status: 'error' as const,
      code: 'INVALID_INPUT' as const,
      next_action: 'correct_input' as const,
      retryable: false,
    };
  const value = parsed.data;
  const inputFingerprint = fingerprint(value);
  const row = await loadAgentDraftForMutation(
    value.draft_id,
    value.draft_token
  );
  if (!row) return unavailable();
  if (row.preview.launch?.inputFingerprint === inputFingerprint) {
    return row.preview.launch.result;
  }
  const resolution = await resolveAgentRelease(value);
  if (resolution.status === 'error') {
    return {
      ...resolution,
      next_action: resolution.retryable
        ? ('retry' as const)
        : ('correct_input' as const),
    };
  }
  const result = draftResult(value, row, resolution.facts);
  const stored: StoredReleaseLaunch = { inputFingerprint, result };
  const persisted = await storeAgentReleaseLaunch(
    value.draft_id,
    value.draft_token,
    row.preview.launch?.inputFingerprint ?? null,
    stored
  );
  if (!persisted) return unavailable();
  if (persisted.preview.launch?.inputFingerprint === inputFingerprint) {
    return persisted.preview.launch.result;
  }
  return {
    status: 'error' as const,
    code: 'DRAFT_CHANGED' as const,
    next_action: 'retry' as const,
    retryable: true,
  };
}
