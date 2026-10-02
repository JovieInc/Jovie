import { describe, expect, it } from 'vitest';
import {
  buildBlogPublishLatency,
  findBlogQualificationRun,
  isStrictBlogContentPr,
} from '../blog-publish-latency.mjs';

const post = {
  filename: 'apps/web/content/blog/latency-sample.md',
  status: 'modified',
};

describe('blog publish latency', () => {
  it('matches an unlinked Actions run only to the exact candidate branch and head', () => {
    const pr = {
      number: 42,
      headRefName: 'candidate',
      headRefOid: 'a'.repeat(40),
    };
    const exact = {
      id: 1,
      head_sha: pr.headRefOid,
      head_branch: pr.headRefName,
      prNumbers: [],
    };
    expect(
      findBlogQualificationRun(
        [
          exact,
          { ...exact, id: 2, head_sha: 'b'.repeat(40), prNumbers: [42] },
          { ...exact, id: 3, head_branch: 'other' },
        ],
        pr
      )
    ).toEqual(exact);
    expect(
      findBlogQualificationRun([{ ...exact, head_branch: 'other' }], pr)
    ).toBeUndefined();
  });

  it('attributes native qualification only to a proven merged head and the same PR', () => {
    const pr = {
      number: 42,
      headRefName: 'candidate',
      headRefOid: 'a'.repeat(40),
      mergeCommitSha: 'c'.repeat(40),
    };
    const native = {
      id: 7,
      event: 'merge_group',
      head_sha: pr.mergeCommitSha,
      head_branch: `gh-readonly-queue/main/pr-42-${'b'.repeat(40)}`,
      prNumbers: [],
    };
    expect(findBlogQualificationRun([native], pr)).toEqual(native);
    expect(
      findBlogQualificationRun([{ ...native, head_sha: 'd'.repeat(40) }], pr)
    ).toBeUndefined();
    expect(
      findBlogQualificationRun(
        [
          {
            ...native,
            head_branch: `gh-readonly-queue/main/pr-43-${'b'.repeat(40)}`,
          },
        ],
        pr
      )
    ).toBeUndefined();
    expect(
      findBlogQualificationRun([{ ...native, event: 'pull_request' }], pr)
    ).toBeUndefined();
    expect(
      findBlogQualificationRun(
        [{ ...native, workflow: 'fork-pr-gate.yml' }],
        pr
      )
    ).toBeUndefined();
  });

  it('discloses unclassified PRs instead of silently reporting a complete cohort', () => {
    const report = buildBlogPublishLatency({
      mergedPrs: [
        {
          number: 1,
          mergedAt: '2026-10-01T01:00:00Z',
          mergeCommitSha: 'a',
          files: [post],
        },
        { number: 2, mergedAt: '2026-10-01T01:00:00Z', mergeCommitSha: 'b' },
      ],
    });
    expect(report.classification).toEqual({
      mergedPrCount: 2,
      classifiedPrCount: 1,
      unclassifiedPrCount: 1,
      complete: false,
    });
  });
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
    const raw = {
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
    };
    const report = buildBlogPublishLatency(raw);

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

    // Missing API/run-history evidence cannot establish the legacy cohort.
    delete raw.mergedPrs[0].blogQualification;
    const unknown = buildBlogPublishLatency(raw);
    expect(unknown.samples[0].cohort).toBe('unknown');
    expect(unknown.cohorts.legacy.completeSampleCount).toBe(0);
    raw.mergedPrs[0].blogQualificationConfirmedAbsent = true;
    expect(
      buildBlogPublishLatency(raw).cohorts.legacy.completeSampleCount
    ).toBe(1);
  });
});
