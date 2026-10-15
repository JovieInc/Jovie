/** Contract fixtures, not live retrieval or evidence of model quality. */
import { digest } from './artist-identity.mjs';

export const REPLAY_TIME = Date.parse('2026-10-15T00:00:00Z');
export const SLICES = Object.freeze([
  'collaborations',
  'compilations',
  'legitimate-neighbors',
  'reused-contradictory-metadata',
  'same-name',
  'sparse-catalogs',
  'transliterations-aliases',
]);

export function fixtureProvenance(ref) {
  return {
    ref,
    sha256: digest(ref),
    observedAt: REPLAY_TIME - 1000,
    validUntil: REPLAY_TIME + 60000,
  };
}

export function buildArtistCorpus(sourceSha) {
  const examples = [];
  for (const split of ['tuning', 'holdout']) {
    for (const slice of SLICES) {
      for (const label of ['positive', 'negative', 'unresolved']) {
        const id = `${split}:${slice}:${label}`;
        const name = split === 'tuning' ? 'Sora' : 'Nami';
        const track = {
          title: `${split === 'tuning' ? 'Daybreak' : 'Afterglow'} ${slice}`,
          role: 'primary',
          isrc: split === 'tuning' ? 'USZZZ2600001' : 'GBZZZ2600002',
        };
        const recordings = label === 'unresolved' ? [] : [track];
        const source = {
          name,
          aliases: [],
          recordings,
          provenance: fixtureProvenance(`${id}:source`),
        };
        const candidate = {
          id: `fixture:${id}:a`,
          name,
          aliases: [],
          recordings,
          identity: label === 'negative' ? 'conflict' : 'ambiguous',
          provenance: fixtureProvenance(`${id}:a`),
        };
        if (slice === 'transliterations-aliases') {
          source.name = split === 'tuning' ? '空' : '波';
          source.aliases = [name];
        }
        if (slice === 'collaborations' || slice === 'compilations') {
          candidate.recordings = [
            {
              ...track,
              role:
                slice === 'collaborations' ? 'collaboration' : 'compilation',
            },
            ...recordings,
          ];
        }
        examples.push({
          id,
          split,
          asOf: REPLAY_TIME,
          slice,
          label,
          identityGroup: id,
          origin: 'synthetic-contract',
          evidenceRef: `synthetic:${id}`,
          expected:
            label === 'positive'
              ? candidate.id
              : label === 'negative'
                ? 'no-match'
                : 'review',
          input: {
            sourceSha,
            scope: 'JOV-6425 synthetic shadow corpus',
            tenantDigest: digest('fixture-tenant'),
            policyDigest: digest('fixture-policy'),
            provider: 'apple_music',
            source,
            corrections: [],
            candidates: [
              candidate,
              {
                ...candidate,
                id: `fixture:${id}:b`,
                recordings: [],
                identity: 'ambiguous',
                provenance: fixtureProvenance(`${id}:b`),
              },
            ],
          },
        });
      }
    }
  }
  // An existing first-party resolver reference failure, never a newly inferred profile.
  const real = structuredClone(
    examples.find(
      example => example.split === 'holdout' && example.label === 'negative'
    )
  );
  real.id = 'tim-wrong-beatport-identity';
  real.identityGroup = real.id;
  real.slice = 'same-name';
  real.origin = 'repo-reference-failure';
  real.evidenceRef =
    'apps/web/lib/music-resolver/shadow.ts#tim-wrong-beatport-identity';
  real.input.provider = 'beatport';
  real.input.source.name = 'Tim White';
  real.input.source.recordings = [
    { title: 'Take Me Over', role: 'primary', isrc: null },
  ];
  real.input.source.provenance = fixtureProvenance(real.evidenceRef);
  real.input.candidates = [
    {
      id: '406847',
      name: 'Tim White',
      aliases: [],
      recordings: [],
      identity: 'conflict',
      provenance: fixtureProvenance(
        'https://www.beatport.com/artist/tim-white/406847'
      ),
    },
  ];
  examples.push(real);
  return { schema: 'jev-artist-corpus/v1', version: '2026-10-15.1', examples };
}

/** Prospect discoveries use this same input/label/provenance contract; no provider fetch here. */
export function validateArtistCorpus(corpus) {
  if (
    corpus?.schema !== 'jev-artist-corpus/v1' ||
    typeof corpus.version !== 'string' ||
    !corpus.version.trim() ||
    !Array.isArray(corpus.examples) ||
    !corpus.examples.length
  ) {
    throw new Error('versioned non-empty artist corpus required');
  }
  const ids = new Set();
  const groups = new Map();
  for (const example of corpus.examples) {
    if (
      !example.id ||
      !Number.isFinite(example.asOf) ||
      ids.has(example.id) ||
      !['tuning', 'holdout'].includes(example.split) ||
      !SLICES.includes(example.slice) ||
      !['positive', 'negative', 'unresolved'].includes(example.label) ||
      !example.identityGroup ||
      !example.origin ||
      (example.label === 'positive'
        ? !example.input.candidates.some(
            candidate => candidate.id === example.expected
          )
        : example.expected !==
          (example.label === 'negative' ? 'no-match' : 'review'))
    ) {
      throw new Error('invalid, duplicate or unbounded corpus label');
    }
    ids.add(example.id);
    if (
      groups.has(example.identityGroup) &&
      groups.get(example.identityGroup) !== example.split
    ) {
      throw new Error('identity group leaked across tuning and holdout');
    }
    groups.set(example.identityGroup, example.split);
  }
  return corpus;
}
