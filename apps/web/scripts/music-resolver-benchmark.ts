/**
 * Independent live benchmark for the in-house resolver (JOV-7822).
 *
 *   pnpm benchmark:music-resolver <corpus.jsonl> [--limit N] [--out FILE]
 *
 * Ground truth is first-party: each row is a release imported from the
 * artist's own Spotify catalog (Spotify album URL + UPC + title + primary
 * artist). The candidate reaches Spotify by a different path (UPC lookup,
 * Apple/MusicBrainz name search, cross-links), so agreement is evidence, but
 * Spotify is a shared upstream and rows are not human-adjudicated. The
 * receipt says so; it never claims more than it measured.
 */
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolveInHouse } from '../lib/music-resolver/in-house';
import type { InHouseQuery } from '../lib/music-resolver/in-house-contracts';
import { createDefaultInHouseSources } from '../lib/music-resolver/in-house-sources';

export interface CorpusRow {
  readonly spotify_url: string;
  readonly upc: string;
  readonly title: string;
  readonly artist: string | null;
  readonly release_type?: string;
}

type Outcome =
  | 'correct'
  | 'twin'
  | 'wrong'
  | 'abstained'
  | 'no_spotify_link'
  | 'error';

/** Wilson score interval, 95%. */
export function wilson(successes: number, n: number) {
  if (!n) return null;
  const z = 1.96;
  const p = successes / n;
  const denom = 1 + (z * z) / n;
  const centre = (p + (z * z) / (2 * n)) / denom;
  const half =
    (z * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n))) / denom;
  const r = (v: number) => Math.round(v * 10_000) / 10_000;
  return {
    estimate: r(p),
    low: r(Math.max(0, centre - half)),
    high: r(Math.min(1, centre + half)),
  };
}

export function spotifyAlbumId(url: string | undefined): string | null {
  return (
    url?.match(
      /open\.spotify\.com\/(?:intl-[a-z]+\/)?album\/([A-Za-z0-9]{22})/
    )?.[1] ?? null
  );
}

/**
 * A returned Spotify id that differs from the corpus id is only a wrong
 * release if its own record carries a different UPC. Spotify keeps unplayable
 * twins (same UPC, same release, no markets) that search never returns, and
 * catalog imports can hold the twin. Read the returned album back to tell
 * the two apart; null means it could not be read, which stays wrong.
 */
async function returnedAlbumUpc(url: string): Promise<string | null> {
  const id = spotifyAlbumId(url);
  if (!id) return null;
  try {
    const { spotifyClient } = await import('../lib/spotify/client');
    const payload = await spotifyClient.requestJson<{
      external_ids?: { upc?: string };
    }>(`/albums/${id}`);
    return payload.external_ids?.upc ?? null;
  } catch {
    return null;
  }
}

async function run(query: InHouseQuery) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 30_000);
  try {
    return await resolveInHouse(
      query,
      createDefaultInHouseSources(controller.signal)
    );
  } finally {
    clearTimeout(timer);
  }
}

export async function evaluate(row: CorpusRow) {
  const truth = spotifyAlbumId(row.spotify_url);
  const cases: Record<string, Outcome> = {};
  const detail: Record<string, unknown> = {};
  const linkCase = async (name: string, query: InHouseQuery) => {
    try {
      const result = await run(query);
      const spotify = result.links.find(link => link.provider === 'spotify');
      detail[name] = {
        status: result.status,
        spotify: spotify?.url ?? null,
        provenance: spotify?.provenance ?? null,
        providers: result.links.map(l => l.provider),
      };
      if (result.status !== 'resolved') cases[name] = 'abstained';
      else if (!spotify) cases[name] = 'no_spotify_link';
      else if (spotifyAlbumId(spotify.url) === truth) cases[name] = 'correct';
      else {
        const upc = await returnedAlbumUpc(spotify.url);
        const sameUpc =
          upc !== null && upc.replace(/^0+/, '') === row.upc.replace(/^0+/, '');
        // A playable same-UPC twin is the right release and the album a
        // listener needs: scored correct, reported separately.
        cases[name] = sameUpc ? 'twin' : 'wrong';
        (detail[name] as Record<string, unknown>).returnedAlbumUpc = upc;
        (detail[name] as Record<string, unknown>).sameUpcAsTruth = sameUpc;
      }
      return result;
    } catch (error) {
      cases[name] = 'error';
      detail[name] = {
        error: error instanceof Error ? error.message : String(error),
      };
      return null;
    }
  };
  await linkCase('upc_to_spotify', { kind: 'album', upc: row.upc });
  if (row.artist)
    await linkCase('name_to_spotify', {
      kind: 'album',
      artist: row.artist,
      title: row.title,
    });
  try {
    const byUrl = await run({ kind: 'album', url: row.spotify_url });
    detail.url_to_upc = { status: byUrl.status, upc: byUrl.upc };
    cases.url_to_upc =
      byUrl.status !== 'resolved'
        ? 'abstained'
        : !byUrl.upc
          ? 'no_spotify_link'
          : byUrl.upc.replace(/^0+/, '') === row.upc.replace(/^0+/, '')
            ? 'correct'
            : 'wrong';
  } catch {
    cases.url_to_upc = 'error';
  }
  return { row, cases, detail };
}

function providerCoverage(
  results: readonly { detail: Record<string, unknown> }[],
  name: string
): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const result of results) {
    const providers =
      (result.detail[name] as { providers?: string[] } | undefined)
        ?.providers ?? [];
    for (const provider of new Set(providers))
      counts[provider] = (counts[provider] ?? 0) + 1;
  }
  return counts;
}

export function summarizeBenchmark(
  results: readonly Awaited<ReturnType<typeof evaluate>>[]
): Record<string, unknown> {
  const metrics: Record<string, unknown> = {};
  for (const name of ['upc_to_spotify', 'name_to_spotify', 'url_to_upc']) {
    const outcomes = results
      .map(r => r.cases[name])
      .filter(Boolean) as Outcome[];
    const count = (o: Outcome) => outcomes.filter(x => x === o).length;
    const exact = count('correct');
    const twin = count('twin');
    const wrong = count('wrong');
    // A same-UPC twin is a correct link; it is reported on its own line.
    const correct = exact + twin;
    const answered = correct + wrong;
    metrics[name] = {
      n: outcomes.length,
      correct,
      correctExactId: exact,
      wrongSameUpcTwin: twin,
      wrong,
      abstained: count('abstained'),
      noSpotifyLink: count('no_spotify_link'),
      errors: count('error'),
      precision: wilson(correct, answered),
      usefulCoverage: wilson(correct, outcomes.length),
      falseLinkRate: wilson(wrong, answered),
      providerCoverage: providerCoverage(results, name),
    };
  }
  return metrics;
}

async function main() {
  const [corpusPath, ...rest] = process.argv.slice(2);
  if (!corpusPath)
    throw new Error(
      'usage: music-resolver-benchmark <corpus.jsonl> [--limit N] [--out FILE]'
    );
  const limitIndex = rest.indexOf('--limit');
  const outIndex = rest.indexOf('--out');
  const bytes = readFileSync(corpusPath);
  let rows: CorpusRow[] = bytes
    .toString('utf8')
    .trim()
    .split('\n')
    .map(line => JSON.parse(line));
  if (limitIndex >= 0) rows = rows.slice(0, Number(rest[limitIndex + 1]));
  const startedAt = new Date().toISOString();
  const results: Awaited<ReturnType<typeof evaluate>>[] = [];
  const concurrency = 3;
  for (let i = 0; i < rows.length; i += concurrency) {
    results.push(
      ...(await Promise.all(rows.slice(i, i + concurrency).map(evaluate)))
    );
    process.stderr.write(`\r${results.length}/${rows.length}`);
  }
  process.stderr.write('\n');
  const metrics = summarizeBenchmark(results);
  const receipt = {
    schema: 'jovie.resolver-benchmark/v1',
    candidate: 'in-house resolver (resolveInHouse, default sources)',
    candidateSha: process.env.CANDIDATE_SHA ?? null,
    corpus: {
      path: corpusPath,
      sha256: createHash('sha256').update(bytes).digest('hex'),
      rows: rows.length,
      truthSource:
        'first-party Spotify artist-catalog imports (provider_links ingested, owner_type=release)',
      independentlyAdjudicated: false,
      sharedUpstream: ['spotify'],
    },
    startedAt,
    finishedAt: new Date().toISOString(),
    metrics,
    wrongCases: results.flatMap(r =>
      Object.entries(r.cases)
        .filter(([, o]) => o === 'wrong')
        .map(([name]) => ({
          case: name,
          title: r.row.title,
          artist: r.row.artist,
          truth: r.row.spotify_url,
          upc: r.row.upc,
          got: r.detail[name],
        }))
    ),
    results,
  };
  const out = outIndex >= 0 ? rest[outIndex + 1] : null;
  if (out) writeFileSync(out, JSON.stringify(receipt, null, 2));
  process.stdout.write(
    `${JSON.stringify({ corpus: receipt.corpus, metrics, wrongCases: receipt.wrongCases.slice(0, 25) }, null, 2)}\n`
  );
}

if (process.argv[1]?.includes('music-resolver-benchmark')) {
  main().catch(error => {
    process.stderr.write(`${error instanceof Error ? error.stack : error}\n`);
    process.exit(1);
  });
}
