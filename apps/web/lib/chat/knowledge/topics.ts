import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Knowledge topic registry.
 *
 * Each topic maps to a distilled markdown file in scripts/knowledge/topics/.
 * Content is loaded once at module scope (cold start) and cached for the
 * lifetime of the serverless function instance.
 */

interface KnowledgeTopic {
  readonly id: string;
  readonly keywords: string[];
  readonly content: string;
}

const TOPICS_DIR = join(process.cwd(), 'scripts/knowledge/topics');

function loadTopic(filename: string): string {
  try {
    return readFileSync(join(TOPICS_DIR, filename), 'utf-8');
  } catch {
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
      'drop',
      'schedule',
      'timeline',
      'lead time',
      'release date',
      'friday',
      'new music',
      'release radar',
      'pre-release',
      'album release',
      'single release',
      'when should i release',
      'how to release',
      'dropping',
    ],
    content: loadTopic('release-strategy.md'),
  },
  {
    id: 'playlist-strategy',
    keywords: [
      'playlist',
      'editorial',
      'algorithmic',
      'pitch',
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
  },
  {
    id: 'streaming-metrics',
    keywords: [
      'stream',
      'streams',
      'listener',
      'listeners',
      'follower',
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
      'ad',
      'campaign',
      'discovery mode',
      'press',
      'influencer',
      'viral',
      'growth',
      'how to promote',
      'how to market',
      'grow my audience',
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
      'deliver',
      'delivery',
      'digital distribution',
      'encoding',
      'wav',
      'flac',
      'mp3',
      'audio quality',
      'specs',
      'how to distribute',
    ],
    content: loadTopic('distribution-basics.md'),
  },
  {
    id: 'monetization',
    keywords: [
      'royalty',
      'royalties',
      'revenue',
      'income',
      'payment',
      'payout',
      'per stream',
      'sync',
      'licensing',
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
  },
  {
    id: 'music-rights',
    keywords: [
      'copyright',
      'publishing',
      'master',
      'composition',
      'split',
      'splits',
      'songwriter',
      'rights',
      'license',
      'mechanical',
      'performance',
      'pro',
      'ascap',
      'bmi',
      'sesac',
      'ownership',
      'sample',
      'cover',
      'interpolation',
      'who owns',
    ],
    content: loadTopic('music-rights.md'),
  },
] as const;
