/** Public HTTP evidence only. Never implies account ownership or search lift. */
import { z } from 'zod';
import { hasServerError } from './public-profile';

const checkSchema = z.object({
  id: z.string().min(1),
  status: z.enum(['pass', 'fail', 'unknown']),
  evidence: z.array(z.string()),
});
export const artistProfileSnapshotSchema = z.object({
  schema: z.literal('jovie-public-artist-integrity/v2'),
  id: z.string().min(1),
  observedAt: z.iso.datetime(),
  profileUrl: z.url(),
  artistName: z.string().min(1),
  spotifyUrl: z.url(),
  releaseSha: z.string().nullable(),
  htmlSha256: z.string().regex(/^[a-f0-9]{64}$/),
  checks: z.array(checkSchema).min(1),
  links: z.array(z.url()),
});
export type ArtistProfileSnapshot = z.infer<typeof artistProfileSnapshotSchema>;

export function inspectArtistProfile(input: {
  document: Document;
  html: string;
  httpStatus: number;
  profileUrl: string;
  artistName: string;
  spotifyUrl: string;
}) {
  const { document, profileUrl, artistName, spotifyUrl } = input;
  const normalize = (value: string | null) => value?.trim().toLowerCase();
  const graphs = [
    ...document.querySelectorAll('script[type="application/ld+json"]'),
  ].flatMap(script => {
    try {
      const value = JSON.parse(script.textContent ?? '') as Record<
        string,
        unknown
      >;
      return Array.isArray(value['@graph']) ? value['@graph'] : [value];
    } catch {
      return [];
    }
  }) as Record<string, unknown>[];
  const entity = graphs.find(
    value => value?.['@id'] === `${profileUrl}#musicgroup`
  );
  const rawMentions: unknown = entity?.mentions;
  let mentions: unknown[] = [];
  if (rawMentions !== undefined) {
    mentions = Array.isArray(rawMentions) ? rawMentions : [rawMentions];
  }
  const mentionSchema = z.object({
    '@type': z.union([z.string(), z.array(z.string())]),
    name: z.string(),
    url: z.string(),
  });
  const parsedMentions = mentions.map(value => mentionSchema.safeParse(value));
  const knownMentions = parsedMentions.every(value => value.success);
  const entries = parsedMentions.flatMap(value =>
    value.success ? [value.data] : []
  );
  const types = (entry: z.infer<typeof mentionSchema>) =>
    [entry['@type']].flat();
  const wrongMentions = entries.filter(
    value =>
      types(value).some(type => type === 'MusicGroup' || type === 'Person') &&
      normalize(value.name) === normalize(artistName) &&
      value.url !== profileUrl
  );
  const releaseUrls = new Set(
    entries
      .filter(
        value =>
          types(value).some(
            type => type === 'MusicRecording' || type === 'MusicAlbum'
          ) && value.url.startsWith(`${profileUrl}/`)
      )
      .map(value => value.url)
  );
  const about = document.querySelector('[data-testid="profile-aeo-content"]');
  const wrongSelfLinks = [...(about?.querySelectorAll('a[href]') ?? [])].filter(
    a => {
      if (normalize(a.textContent) !== normalize(artistName)) return false;
      try {
        const href = new URL(a.getAttribute('href') ?? '', profileUrl).href;
        return href !== profileUrl && !releaseUrls.has(href);
      } catch {
        return true;
      }
    }
  );
  const canonical = document
    .querySelector('link[rel="canonical"]')
    ?.getAttribute('href');
  const sameAs = Array.isArray(entity?.sameAs) ? entity.sameAs : [];
  const available = input.httpStatus === 200 && !hasServerError(input.html);
  const check = (
    id: string,
    pass: boolean,
    evidence: string[],
    known = available
  ) => {
    let status: 'pass' | 'fail' | 'unknown' = 'unknown';
    if (known) status = pass ? 'pass' : 'fail';
    return { id, status, evidence };
  };
  return {
    checks: [
      check('profile-available', available, [`HTTP ${input.httpStatus}`], true),
      check('canonical-profile', canonical === profileUrl, [
        canonical ?? 'missing',
      ]),
      check(
        'spotify-identity',
        sameAs.includes(spotifyUrl),
        sameAs.filter((v): v is string => typeof v === 'string')
      ),
      check('about-present', about !== null, [about ? 'present' : 'missing']),
      check(
        'no-ambiguous-self-links',
        wrongSelfLinks.length === 0,
        wrongSelfLinks.map(a => a.getAttribute('href') ?? ''),
        available && about !== null
      ),
      check(
        'no-ambiguous-self-mentions',
        wrongMentions.length === 0,
        wrongMentions.map(v => String(v.url)),
        available && entity !== undefined && knownMentions
      ),
    ],
    links: [
      ...new Set(
        [
          ...[...document.querySelectorAll('a[href]')].map(a =>
            a.getAttribute('href')
          ),
          ...entries.map(entry => entry.url),
          ...sameAs.filter(
            (value): value is string => typeof value === 'string'
          ),
        ].flatMap(value => {
          try {
            const url = new URL(value ?? '', profileUrl);
            return ['https:', 'http:'].includes(url.protocol) ? [url.href] : [];
          } catch {
            return [];
          }
        })
      ),
    ].sort((left, right) => left.localeCompare(right)),
  };
}

/** Comparable observed changes, not causal attribution or permission to publish. */
export function compareArtistProfileSnapshots(
  baseline: unknown,
  current: unknown
) {
  const before = artistProfileSnapshotSchema.parse(baseline);
  const after = artistProfileSnapshotSchema.parse(current);
  const roster = (snapshot: ArtistProfileSnapshot) =>
    snapshot.checks
      .map(c => c.id)
      .sort()
      .join('\n');
  if (
    before.profileUrl !== after.profileUrl ||
    before.artistName !== after.artistName ||
    before.spotifyUrl !== after.spotifyUrl ||
    roster(before) !== roster(after) ||
    new Set(before.checks.map(c => c.id)).size !== before.checks.length ||
    new Set(after.checks.map(c => c.id)).size !== after.checks.length ||
    before.id === after.id ||
    Date.parse(after.observedAt) <= Date.parse(before.observedAt)
  ) {
    return {
      comparable: false as const,
      reason: 'identity_roster_or_time_mismatch',
      fixed: [],
      regressed: [],
      delta: null,
    };
  }
  const old = new Map(before.checks.map(c => [c.id, c.status]));
  const fixed = after.checks
    .filter(c => c.status === 'pass' && old.get(c.id) === 'fail')
    .map(c => c.id);
  const regressed = after.checks
    .filter(c => c.status === 'fail' && old.get(c.id) === 'pass')
    .map(c => c.id);
  const complete = [...before.checks, ...after.checks].every(
    c => c.status !== 'unknown'
  );
  return {
    comparable: true as const,
    reason: complete
      ? 'same_public_integrity_checks'
      : 'incomplete_measurement',
    fixed,
    regressed,
    delta: complete ? fixed.length - regressed.length : null,
  };
}
