import { describe, expect, it } from 'vitest';
import {
  buildBlogPublishLatency,
  isStrictBlogContentPr,
} from '../blog-publish-latency.mjs';

const post = {
  filename: 'apps/web/content/blog/latency-sample.md',
  status: 'modified',
};

describe('blog publish latency', () => {
  it('rejects mixed, renamed, executable, and unsafe samples', () => {
    expect(isStrictBlogContentPr({ files: [post] })).toBe(true);
    for (const files of [
      [post, { filename: '.github/workflows/ci.yml', status: 'modified' }],
      [{ ...post, status: 'renamed', previousFilename: 'old.md' }],
      [{ filename: 'apps/web/content/blog/post.mdx', status: 'modified' }],
      [{ filename: 'apps/web/public/images/blog/post.svg', status: 'added' }],
    ]) {
      expect(isStrictBlogContentPr({ files })).toBe(false);
    }
  });

  it('records each stage and keeps before/after claims null', () => {
    const report = buildBlogPublishLatency({
      collectedAt: '2026-10-02T02:00:00Z',
      mergedPrs: [
        {
          number: 42,
          createdAt: '2026-10-01T00:00:00Z',
          mergedAt: '2026-10-01T01:00:00Z',
          mergeCommitSha: 'a'.repeat(40),
          files: [post],
          blogQualification: {
            startedAt: '2026-10-01T00:10:00Z',
            completedAt: '2026-10-01T00:20:00Z',
            retries: 1,
            runnerSeconds: 600,
            buildSeconds: null,
          },
          productionVerifiedAt: '2026-10-01T01:20:00Z',
        },
      ],
      timelines: {
        42: [{ type: 'added_to_merge_queue', at: '2026-10-01T00:40:00Z' }],
      },
      deployments: [
        {
          status: 'success',
          sha: 'a'.repeat(40),
          createdAt: '2026-10-01T01:10:00Z',
        },
      ],
    });

    expect(report).toMatchObject({
      sampleCount: 1,
      cohorts: {
        legacy: { sampleCount: 0, completeSampleCount: 0 },
        contentOnly: { sampleCount: 1, completeSampleCount: 1 },
      },
      claims: { measuredImprovement: null, publishingSla: null },
    });
    expect(report.samples[0]).toMatchObject({
      qualificationSeconds: 600,
      queueWaitSeconds: 1200,
      deploymentSeconds: 600,
      candidateToLiveSeconds: 4800,
      retries: 1,
    });
  });
});
