import type {
  RecordFileEdgeInput,
  RecordFileEntityInput,
  RecordFileSourceInput,
} from '../build';

/**
 * SYNTHETIC record-file fixture modelled on the shape of a 2015 single's
 * paperwork. Every name, title and domain is made up; domains use the
 * reserved `.example` TLD. No addresses, phone numbers, amounts, codes,
 * split percentages or contract terms appear here.
 */

export const SYNTHETIC_AS_OF = new Date('2026-11-01T00:00:00.000Z');

export const syntheticRecord: RecordFileEntityInput = {
  id: 'rec-night-signal',
  type: 'release',
  primaryName: 'Night Signal',
  metadata: { releaseDate: '2015-06-12' },
};

export const syntheticEntities: readonly RecordFileEntityInput[] = [
  syntheticRecord,
  {
    id: 'ent-artist',
    type: 'artist',
    primaryName: 'Ada Vale',
    metadata: {},
  },
  {
    id: 'ent-milo',
    type: 'person',
    primaryName: 'Milo Reyes',
    metadata: { featureConsent: 'ok' },
  },
  {
    id: 'ent-juno',
    type: 'person',
    primaryName: 'Juno Park',
    metadata: { featureConsent: 'do_not_feature' },
  },
  {
    id: 'ent-cass',
    type: 'person',
    primaryName: 'Cass Ortega',
    metadata: {},
  },
];

export const syntheticEdges: readonly RecordFileEdgeInput[] = [
  {
    fromEntityId: 'ent-artist',
    toEntityId: 'rec-night-signal',
    relation: 'released',
    metadata: {},
  },
  {
    fromEntityId: 'ent-milo',
    toEntityId: 'rec-night-signal',
    relation: 'co_writer',
    metadata: { evidenceSourceRecordIds: ['src-split-sheet'] },
  },
  {
    fromEntityId: 'ent-juno',
    toEntityId: 'rec-night-signal',
    relation: 'co_writer',
    metadata: { evidenceSourceRecordIds: ['src-split-sheet'] },
  },
  {
    fromEntityId: 'ent-cass',
    toEntityId: 'rec-night-signal',
    relation: 'mixer',
    metadata: {},
  },
  // Not a record-file role: ignored.
  {
    fromEntityId: 'ent-cass',
    toEntityId: 'rec-night-signal',
    relation: 'mentioned_with',
    metadata: {},
  },
];

function source(
  id: string,
  subject: string,
  sender: { name: string; domain: string },
  date: string,
  extra: Record<string, unknown> = {}
): RecordFileSourceInput {
  return {
    id,
    sourceType: 'gmail_message',
    externalId: `gmail:${id}`,
    metadata: { subject, from: sender, date, ...extra },
    createdAt: new Date(date),
  };
}

const milo = { name: 'Milo Reyes', domain: 'miloreyes.example' };
const juno = { name: 'Juno Park', domain: 'junopark.example' };
const cass = { name: 'Cass Ortega', domain: 'cassmix.example' };
const label = { name: 'Lowtide Records', domain: 'lowtide.example' };

export const syntheticSources: readonly RecordFileSourceInput[] = [
  source(
    'src-split-sheet',
    'Night Signal split sheet',
    milo,
    '2015-02-03T18:00:00.000Z',
    { participants: [juno] }
  ),
  source(
    'src-vocal-comp',
    'Re: Night Signal - vocal comp',
    juno,
    '2015-02-20T21:00:00.000Z',
    // A body-like field: must never reach the record file.
    { snippet: 'SYNTHETIC-BODY-MUST-NOT-APPEAR' }
  ),
  source('src-mix-v3', 'Night Signal mix v3', cass, '2015-03-10T17:30:00.000Z'),
  source(
    'src-master-ready',
    'Master ready: Night Signal',
    { name: 'Northside Mastering', domain: 'northside-mastering.example' },
    '2015-04-01T16:00:00.000Z'
  ),
  source(
    'src-artwork',
    'Night Signal cover art finals',
    { name: 'Rowan Hale', domain: 'rowanhale.example' },
    '2015-04-15T12:00:00.000Z'
  ),
  source(
    'src-distro-live',
    'Your release Night Signal is live in stores',
    { name: 'Waveline Distribution', domain: 'waveline.example' },
    '2015-06-12T09:00:00.000Z'
  ),
  source(
    'src-split-change',
    'Split change confirmation - Night Signal',
    { name: 'Harbor Lane Publishing', domain: 'harborlane.example' },
    '2016-01-08T15:00:00.000Z'
  ),
  source(
    'src-soundexchange',
    'SoundExchange repertoire update',
    { name: 'Rights Desk', domain: 'rightsdesk.example' },
    '2016-03-02T10:00:00.000Z'
  ),
  source(
    'src-remix-lumen-sent',
    'Remix Agreement - Night Signal (Lumen Remix)',
    label,
    '2016-05-01T14:00:00.000Z'
  ),
  source(
    'src-remix-lumen-signed',
    'Completed: Remix Agreement - Night Signal (Lumen Remix)',
    label,
    '2016-05-09T14:00:00.000Z'
  ),
  source(
    'src-remix-tidewater-sent',
    'Remix Agreement - Night Signal (Tidewater Remix) for signature',
    label,
    '2016-07-11T14:00:00.000Z'
  ),
  source(
    'src-remix-wrong-artist',
    'Night Signal (Tidewater Remix) credited to wrong artist',
    { name: 'Waveline Distribution', domain: 'waveline.example' },
    '2016-09-20T11:00:00.000Z'
  ),
  // Matches no rule and comes from nobody on the record: stays untagged.
  source(
    'src-unrelated',
    'Lunch next week?',
    { name: 'Theo Marsh', domain: 'theomarsh.example' },
    '2016-10-01T19:00:00.000Z'
  ),
];
