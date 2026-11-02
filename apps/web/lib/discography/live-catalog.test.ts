import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

import {
  buildGroundingFacts,
  enforceGrounding,
} from '@/lib/chat/grounding-guard';

/**
 * Deleted-but-remembered guard (Tim, 2026-10-25): "Testing The Lights" and
 * "Dont Look Down" were test songs Tim deleted; the agent still suggested them.
 * Causes: archive is a soft delete (deletedAt) that agent reads ignored, and a
 * hard delete left profile-scoped recordings behind.
 */
const root = resolve(__dirname, '../..');

// Every agent-facing read of the catalog. A new reader must be added here, and
// must filter deleted/archived releases (or read via live-catalog).
const AGENT_FACING_READERS = [
  'lib/chat/releases.ts',
  'lib/chat/catalog-titles.ts',
  'lib/merch/source-candidates.ts',
  'lib/services/pitch/build-pitch-input.ts',
  'lib/services/insights/data-aggregator.ts',
  'lib/services/release-autopilot/run.ts',
  'lib/submission-agent/service.ts',
  'lib/fit-scoring/service.ts',
];

describe('agent-facing catalog reads never see deleted releases', () => {
  it.each(AGENT_FACING_READERS)(
    '%s filters deletedAt or uses the live catalog',
    file => {
      const source = readFileSync(resolve(root, file), 'utf8');
      const usesLive = source.includes('live-catalog');
      const queriesReleases = source.includes('from(discogReleases)');
      if (queriesReleases) {
        expect(source).toContain('isNull(discogReleases.deletedAt)');
      } else {
        expect(usesLive).toBe(true);
      }
      // No direct recordings read: recordings outlive their release.
      expect(source).not.toMatch(/from\(discogRecordings\)/);
    }
  );

  it('hard delete purges orphan recordings', () => {
    const source = readFileSync(
      resolve(root, 'app/app/(shell)/dashboard/releases/actions.ts'),
      'utf8'
    );
    expect(source).toContain('purgeOrphanRecordings');
  });
});

describe('create -> agent learns -> delete -> agent must not mention it', () => {
  type Row = { title: string; deletedAt: Date | null };
  const liveTitles = (rows: Row[]) =>
    rows.filter(row => row.deletedAt === null).map(row => row.title);
  const artist = { spotifyUrl: 'x', spotifyFollowers: 1, spotifyPopularity: 1 };
  const draft =
    'Your track "Testing The Lights" would make a great next single.';

  it('mentions it while it exists, rejects it after deletion', () => {
    const rows: Row[] = [
      { title: 'Seaside Heights', deletedAt: null },
      { title: 'Testing The Lights', deletedAt: null },
    ];
    // The agent learned the title (it is in the live catalog and in history).
    const before = buildGroundingFacts(
      artist,
      liveTitles(rows).map(title => ({ title })),
      []
    );
    expect(enforceGrounding(draft, before).violations).toHaveLength(0);

    // Tim deletes it. The same reply, drawn from remembered history, is rejected.
    rows[1] = { title: 'Testing The Lights', deletedAt: new Date() };
    const after = buildGroundingFacts(
      artist,
      liveTitles(rows).map(title => ({ title })),
      []
    );
    const result = enforceGrounding(draft, after);
    expect(result.violations.map(v => v.kind)).toEqual([
      'unknown-catalog-title',
    ]);
    expect(result.text).not.toContain('Testing The Lights');
  });
});
