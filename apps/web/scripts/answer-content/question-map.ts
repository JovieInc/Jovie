#!/usr/bin/env tsx
/**
 * Build the artist-growth question map from existing research credits.
 *
 *   # Google PAA + related searches and YouTube titles (SerpAPI, capped)
 *   doppler run -- tsx scripts/answer-content/question-map.ts serp \
 *     --out <dir>/serp.json [--max-searches 30]
 *
 *   # Merge SerpAPI observations and last30days --emit json files
 *   tsx scripts/answer-content/question-map.ts build \
 *     --out data/answer-content/question-map.json <dir>/serp.json <dir>/l30-*.json
 *
 * Raw pulls stay out of git; only the ranked map is committed. SerpAPI's free
 * plan (250 searches a month) is shared with lead discovery, so a run spends
 * at most `--max-searches` (default 30).
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import {
  buildQuestionMap,
  type QuestionMap,
  type QuestionObservation,
} from '@/lib/answer-content/question-map';
import {
  observationsFromLast30Days,
  observationsFromSerpGoogle,
  observationsFromSerpYoutube,
} from '@/lib/answer-content/question-sources';

/** Seed queries for the artist-growth domain: [topic, Google query]. */
export const GOOGLE_SEEDS: readonly (readonly [string, string])[] = [
  ['music marketing', 'how to promote your music as an independent artist'],
  ['music marketing', 'how to market a song on a small budget'],
  ['playlisting', 'how to get your song on spotify playlists'],
  ['playlisting', 'how to pitch to spotify editorial playlists'],
  ['playlisting', 'how to get on apple music playlists'],
  ['release strategy', 'how to release a single independently'],
  ['release strategy', 'how often should musicians release music'],
  ['release strategy', 'what to do before releasing a song'],
  ['release strategy', 'how to do a pre-save campaign'],
  ['streaming', 'how to get more monthly listeners on spotify'],
  ['streaming', 'how does the spotify algorithm work for artists'],
  ['smart links', 'what is a smart link for music'],
  ['smart links', 'best link in bio for musicians'],
  ['fan growth', 'how to grow a fanbase as an independent artist'],
  ['fan growth', 'how to build an email list as a musician'],
  ['fan growth', 'how to turn listeners into fans'],
  ['booking', 'how to get booked for gigs as a musician'],
  ['booking', 'how to find a booking agent for musicians'],
  ['identity', 'how to make an electronic press kit for musicians'],
  ['identity', 'how to get verified on spotify as an artist'],
  ['social', 'how to promote music on tiktok'],
  ['social', 'how to grow a youtube channel as a musician'],
  ['merch', 'how to sell merch as an independent artist'],
  ['press', 'how to get your music reviewed by blogs'],
];

export const YOUTUBE_SEEDS: readonly (readonly [string, string])[] = [
  ['music marketing', 'how to promote your music 2026'],
  ['playlisting', 'spotify playlist pitching tips'],
  ['release strategy', 'music release strategy independent artist'],
  ['fan growth', 'how to grow a fanbase musician'],
  ['booking', 'how to book gigs musician'],
  ['smart links', 'smart link pre save music'],
];

async function serpSearch(
  params: Record<string, string>,
  apiKey: string
): Promise<unknown> {
  const url = new URL('https://serpapi.com/search.json');
  for (const [key, value] of Object.entries(params))
    url.searchParams.set(key, value);
  url.searchParams.set('api_key', apiKey);
  const response = await fetch(url, { signal: AbortSignal.timeout(30_000) });
  if (!response.ok) throw new Error(`SerpAPI HTTP ${response.status}`);
  return response.json();
}

/** One raw SerpAPI response. Kept so rebuilds re-parse without new searches. */
export interface SerpPull {
  readonly topic: string;
  readonly engine: 'google' | 'youtube';
  readonly observedAt: string;
  readonly response: unknown;
}

async function collectSerp(maxSearches: number): Promise<SerpPull[]> {
  const apiKey = process.env.SERPAPI_API_KEY;
  if (!apiKey) throw new Error('SERPAPI_API_KEY is required (use Doppler).');
  const observedAt = new Date().toISOString();
  const pulls: SerpPull[] = [];
  const plan = [
    ...GOOGLE_SEEDS.map(([topic, q]) => ({
      topic,
      engine: 'google' as const,
      q,
    })),
    ...YOUTUBE_SEEDS.map(([topic, q]) => ({
      topic,
      engine: 'youtube' as const,
      q,
    })),
  ].slice(0, maxSearches);
  for (const step of plan) {
    try {
      const response = await serpSearch(
        step.engine === 'google'
          ? { engine: 'google', q: step.q, hl: 'en', gl: 'us' }
          : { engine: 'youtube', search_query: step.q },
        apiKey
      );
      pulls.push({
        topic: step.topic,
        engine: step.engine,
        observedAt,
        response,
      });
    } catch (error) {
      console.warn(`serp ${step.engine} "${step.q}" failed: ${String(error)}`);
    }
  }
  console.log(`serp: ${pulls.length} of ${plan.length} searches returned`);
  return pulls;
}

/** Accepts SerpAPI pulls (serp output) or a last30days JSON report. */
export function observationsFromFile(
  json: unknown,
  observedAt: string
): QuestionObservation[] {
  if (!Array.isArray(json)) return observationsFromLast30Days(json, observedAt);
  return (json as SerpPull[]).flatMap(pull =>
    pull.engine === 'google'
      ? observationsFromSerpGoogle(pull.response, pull.topic, pull.observedAt)
      : observationsFromSerpYoutube(pull.response, pull.topic, pull.observedAt)
  );
}

/** One entry per line: reviewable diffs without a 2,000-line data file. */
export function serializeQuestionMap(map: QuestionMap): string {
  const { entries, ...header } = map;
  const head = JSON.stringify(header).slice(0, -1);
  const body = entries.map(entry => JSON.stringify(entry)).join(',\n');
  return `${head},"entries":[\n${body}\n]}\n`;
}

async function main(): Promise<void> {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: {
      out: { type: 'string' },
      'max-searches': { type: 'string', default: '30' },
      unavailable: { type: 'string', multiple: true },
    },
  });
  const [command, ...inputs] = positionals;
  if (!values.out) throw new Error('--out is required');

  if (command === 'serp') {
    const max = Number.parseInt(values['max-searches'] ?? '30', 10);
    const pulls = await collectSerp(max);
    writeFileSync(values.out, `${JSON.stringify(pulls)}\n`);
    return;
  }
  if (command === 'build') {
    const observedAt = new Date().toISOString();
    const observations = inputs.flatMap(path =>
      observationsFromFile(JSON.parse(readFileSync(path, 'utf8')), observedAt)
    );
    const map = buildQuestionMap(observations, {
      unavailable: values.unavailable ?? [],
      limit: 300,
    });
    writeFileSync(values.out, serializeQuestionMap(map));
    console.log(
      `question map: ${map.entries.length} entries from ${observations.length} observations`
    );
    return;
  }
  throw new Error(
    'usage: question-map.ts <serp|build> --out <file> [inputs...]'
  );
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch(error => {
    console.error(error);
    process.exit(1);
  });
}
