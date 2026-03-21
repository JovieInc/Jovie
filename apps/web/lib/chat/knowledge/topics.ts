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

interface KnowledgeTopic {
  readonly id: string;
  readonly keywords: string[];
  readonly content: string;
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
      'releases',
      'pre-save',
      'countdown',
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
      'release plan',
    ],
    content: loadTopic('release-strategy.md'),
  },
  {
    id: 'playlist-strategy',
    keywords: [
      'playlist',
      'playlists',
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
      'pitch my song',
    ],
    content: loadTopic('playlist-strategy.md'),
  },
  {
    id: 'streaming-metrics',
    keywords: [
      'streams',
      'listeners',
      'followers',
      'popularity',
      'analytics',
      'metrics',
      'monthly listeners',
      'stream count',
      'play count',
      '30 seconds',
      'algorithm',
      'skip rate',
      'completion rate',
      'engagement rate',
      'how streams work',
      'how are streams counted',
      'stream analytics',
    ],
    content: loadTopic('streaming-metrics.md'),
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
      'showcase',
      'spotlight',
      'countdown pages',
      'optimize my profile',
      'artist profile',
      'artist bio',
    ],
    content: loadTopic('profile-optimization.md'),
  },
  {
    id: 'marketing-promotion',
    keywords: [
      'marketing',
      'promotion',
      'social media',
      'fan engagement',
      'fanbase',
      'instagram',
      'tiktok',
      'advertising',
      'campaign',
      'discovery mode',
      'influencer',
      'viral',
      'audience growth',
      'how to promote',
      'how to market',
      'grow my audience',
      'email marketing',
      'newsletter',
    ],
    content: loadTopic('marketing-promotion.md'),
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
      'get my music on spotify',
    ],
    content: loadTopic('distribution-basics.md'),
  },
  {
    id: 'monetization',
    keywords: [
      'royalties',
      'royalty',
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
      'streaming revenue',
    ],
    content: loadTopic('monetization.md'),
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
      'music rights',
    ],
    content: loadTopic('music-rights.md'),
  },
] as const;
