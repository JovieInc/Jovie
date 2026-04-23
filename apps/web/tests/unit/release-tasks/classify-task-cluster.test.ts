import { describe, expect, it, vi } from 'vitest';
import {
  CLASSIFIER_AUTO_CLUSTER_THRESHOLD,
  CLASSIFIER_MIN_CONFIDENCE,
  classifyTaskCluster,
} from '@/lib/release-tasks/classify-task-cluster';

vi.mock('@/lib/error-tracking', () => ({
  captureError: vi.fn(),
}));

const CLUSTERS = [
  { slug: 'rights-royalty-registration', displayName: 'Rights & Royalties' },
  { slug: 'editorial-pitching', displayName: 'Editorial Pitching' },
  { slug: 'dj-promotion', displayName: 'DJ Promotion' },
];

describe('classifyTaskCluster', () => {
  it('returns parsed result when JSON is clean + slug known + confidence high', async () => {
    const result = await classifyTaskCluster(
      'Pitch to Spotify editorial',
      CLUSTERS,
      {
        createMessage: async () => ({
          text: '{"clusterSlug":"editorial-pitching","confidence":0.92,"reasoning":"direct match"}',
        }),
      }
    );
    expect(result.clusterSlug).toBe('editorial-pitching');
    expect(result.confidence).toBeGreaterThanOrEqual(
      CLASSIFIER_AUTO_CLUSTER_THRESHOLD
    );
  });

  it('nulls out unknown slugs from the model', async () => {
    const result = await classifyTaskCluster('whatever', CLUSTERS, {
      createMessage: async () => ({
        text: '{"clusterSlug":"made-up-slug","confidence":0.95}',
      }),
    });
    expect(result.clusterSlug).toBeNull();
    expect(result.confidence).toBe(0);
  });

  it('returns clusterSlug=null when confidence is below the floor', async () => {
    const result = await classifyTaskCluster('Ambiguous', CLUSTERS, {
      createMessage: async () => ({
        text: '{"clusterSlug":"editorial-pitching","confidence":0.4}',
      }),
    });
    expect(result.clusterSlug).toBeNull();
    expect(result.confidence).toBeLessThan(CLASSIFIER_MIN_CONFIDENCE);
  });

  it('extracts JSON from prose-wrapped responses', async () => {
    const result = await classifyTaskCluster('SoundExchange', CLUSTERS, {
      createMessage: async () => ({
        text: 'Sure! {"clusterSlug":"rights-royalty-registration","confidence":0.85} Done.',
      }),
    });
    expect(result.clusterSlug).toBe('rights-royalty-registration');
  });

  it('returns null on malformed JSON', async () => {
    const result = await classifyTaskCluster('x', CLUSTERS, {
      createMessage: async () => ({ text: 'not json at all' }),
    });
    expect(result.clusterSlug).toBeNull();
    expect(result.confidence).toBe(0);
  });

  it('returns null on model call failure', async () => {
    const result = await classifyTaskCluster('x', CLUSTERS, {
      createMessage: async () => {
        throw new Error('network');
      },
    });
    expect(result.clusterSlug).toBeNull();
    expect(result.confidence).toBe(0);
  });

  it('returns null on empty input', async () => {
    const result = await classifyTaskCluster('', CLUSTERS);
    expect(result.clusterSlug).toBeNull();
    expect(result.confidence).toBe(0);
  });

  it('returns null when no clusters are provided', async () => {
    const result = await classifyTaskCluster('anything', []);
    expect(result.clusterSlug).toBeNull();
    expect(result.confidence).toBe(0);
  });

  it('clamps confidence to [0,1]', async () => {
    const result = await classifyTaskCluster('x', CLUSTERS, {
      createMessage: async () => ({
        text: '{"clusterSlug":"dj-promotion","confidence":1.7}',
      }),
    });
    expect(result.confidence).toBeLessThanOrEqual(1);
  });
});
