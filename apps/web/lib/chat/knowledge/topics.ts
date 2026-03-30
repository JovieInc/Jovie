import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Knowledge topic registry.
 *
 * Each topic maps to a distilled markdown file co-located in ./topics/.
 * Content is loaded once at module scope (cold start) and cached for the
 * lifetime of the serverless function instance.
 *
 * Files live inside apps/web so Next.js file tracing includes them in
 * the Vercel standalone bundle automatically.
 */

export interface KnowledgeTopic {
  readonly id: string;
  readonly keywords: string[];
  readonly content: string;
  readonly freshness: 'evergreen' | 'volatile';
  readonly lastReviewed: string;
  readonly caution?: string;
}

const TOPICS_DIR = join(dirname(fileURLToPath(import.meta.url)), 'topics');

function loadTopic(filename: string): string {
  try {
    return readFileSync(join(TOPICS_DIR, filename), 'utf-8');
  } catch (err) {
    console.error(
      `[knowledge] Failed to load topic "${filename}" from ${TOPICS_DIR}:`,
      err instanceof Error ? err.message : err
    );
    return '';
  }
}

/** All knowledge topics, loaded at cold start. */
export const KNOWLEDGE_TOPICS: readonly KnowledgeTopic[] = [
  {
    id: 'release-strategy',
    keywords: [
      'release',
      'pre-save',
      'countdown',
      'launch',
      'schedule',
      'timeline',
      'lead time',
      'release date',
      'friday',
      'new music',
      'pre-release',
      'album release',
      'single release',
      'when should i release',
      'how to release',
    ],
    content: loadTopic('release-strategy.md'),
    freshness: 'volatile',
    lastReviewed: '2026-03-30',
    caution:
      'Release timing, playlist deadlines, and platform feature availability can change by distributor and DSP.',
  },
  {
    id: 'playlist-strategy',
    keywords: [
      'playlist',
      'editorial',
      'algorithmic',
      'pitching',
      'discover weekly',
      'release radar',
      'curated',
      'submission',
      'playlist placement',
      'playlist pitch',
      'get on a playlist',
    ],
    content: loadTopic('playlist-strategy.md'),
    freshness: 'volatile',
    lastReviewed: '2026-03-30',
    caution:
      'Editorial and algorithmic playlist tooling, submission windows, and curator workflows can change over time.',
  },
  {
    id: 'streaming-metrics',
    keywords: [
      'streams',
      'listeners',
      'followers',
      'popularity',
      'monthly listeners',
      'stream count',
      'play count',
      '30 seconds',
      'algorithm',
      'skip rate',
      'completion rate',
      'how streams work',
      'how are streams counted',
    ],
    content: loadTopic('streaming-metrics.md'),
    freshness: 'volatile',
    lastReviewed: '2026-03-30',
    caution:
      'Streaming metrics labels, payout behavior, and platform reporting conventions vary by service and can change.',
  },
  {
    id: 'profile-optimization',
    keywords: [
      'canvas',
      'marquee',
      'artist pick',
      'gallery',
      'header image',
      'clips',
      'short-form video',
      'avatar',
      'branding',
      'artwork',
      'banner',
      'showcase',
      'spotlight',
      'optimize my profile',
    ],
    content: loadTopic('profile-optimization.md'),
    freshness: 'volatile',
    lastReviewed: '2026-03-30',
    caution:
      'DSP campaign tools, visual features, and claimed performance lifts can change or be rolled out unevenly.',
  },
  {
    id: 'marketing-promotion',
    keywords: [
      'marketing',
      'promotion',
      'social media',
      'fan engagement',
      'instagram',
      'tiktok',
      'advertising',
      'campaign',
      'discovery mode',
      'influencer',
      'viral',
      'how to promote',
      'how to market',
      'grow my audience',
    ],
    content: loadTopic('marketing-promotion.md'),
    freshness: 'volatile',
    lastReviewed: '2026-03-30',
    caution:
      'Ad platform minimums, short-form tactics, and campaign performance benchmarks are time-sensitive.',
  },
  {
    id: 'distribution-basics',
    keywords: [
      'distribution',
      'distributor',
      'aggregator',
      'metadata',
      'isrc',
      'upc',
      'upload',
      'delivery',
      'digital distribution',
      'encoding',
      'audio quality',
      'how to distribute',
    ],
    content: loadTopic('distribution-basics.md'),
    freshness: 'volatile',
    lastReviewed: '2026-03-30',
    caution:
      'Distributor features, delivery timelines, and DSP access workflows can change across providers.',
  },
  {
    id: 'monetization',
    keywords: [
      'royalties',
      'revenue',
      'income',
      'payment',
      'payout',
      'per stream',
      'sync licensing',
      'merch',
      'merchandise',
      'touring',
      'concert',
      'brand deal',
      'sponsorship',
      'fan support',
      'tipping',
      'how much do streams pay',
      'how to make money',
    ],
    content: loadTopic('monetization.md'),
    freshness: 'volatile',
    lastReviewed: '2026-03-30',
    caution:
      'Per-stream economics, monetization programs, and campaign returns vary by territory, platform, and time period.',
  },
  {
    id: 'music-rights',
    keywords: [
      'copyright',
      'publishing',
      'master recording',
      'composition',
      'splits',
      'songwriter',
      'rights',
      'mechanical royalties',
      'performance royalties',
      'ascap',
      'bmi',
      'sesac',
      'ownership',
      'sample clearance',
      'cover song',
      'interpolation',
      'who owns',
    ],
    content: loadTopic('music-rights.md'),
    freshness: 'evergreen',
    lastReviewed: '2026-03-30',
    caution:
      'Rights and royalty administration depend on jurisdiction, contract terms, and collection setup.',
  },
] as const;
