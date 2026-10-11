import {
  BLOG_CONTENT_CHECKS,
  classifyBlogContentChanges,
} from './blog-content-ci.mjs';

const STATUS = {
  added: 'A',
  changed: 'M',
  copied: 'C',
  modified: 'M',
  removed: 'D',
  renamed: 'R',
};

const secondsBetween = (start, end) => {
  const value = (Date.parse(end) - Date.parse(start)) / 1000;
  return Number.isFinite(value) && value >= 0 ? value : null;
};

const percentile = (values, fraction) => {
  const sorted = values.filter(Number.isFinite).toSorted((a, b) => a - b);
  if (sorted.length === 0) return null;
  return sorted[Math.ceil(fraction * sorted.length) - 1];
};

const summary = samples => {
  const complete = samples
    .map(sample => sample.candidateToLiveSeconds)
    .filter(Number.isFinite);
  return {
    sampleCount: samples.length,
    completeSampleCount: complete.length,
    candidateToLiveSeconds: {
      p50: percentile(complete, 0.5),
      p95: percentile(complete, 0.95),
    },
    representative: samples.slice(0, 3).map(sample => ({
      pr: sample.pr,
      candidateToLiveSeconds: sample.candidateToLiveSeconds,
      qualificationSeconds: sample.qualificationSeconds,
      queueWaitSeconds: sample.queueWaitSeconds,
      deploymentSeconds: sample.deploymentSeconds,
    })),
  };
};

export function blogChangesForPr(pr) {
  return (pr.files ?? []).map(file => ({
    status: STATUS[file.status] ?? String(file.status ?? '').toUpperCase(),
    path: file.filename,
    oldPath: file.previousFilename,
  }));
}

export function isStrictBlogContentPr(pr) {
  return classifyBlogContentChanges(blogChangesForPr(pr)).contentOnly;
}

export function findBlogQualificationRun(runs, pr) {
  return runs
    .filter(run => {
      if (
        run.workflow &&
        run.workflow !== 'ci.yml' &&
        run.path !== '.github/workflows/ci.yml'
      )
        return false;
      const source =
        run.event !== 'merge_group' &&
        run.head_sha === pr.headRefOid &&
        (run.prNumbers?.includes(pr.number) ||
          run.head_branch === pr.headRefName);
      // The queue suffix is a predecessor SHA, not the PR source SHA. Only a
      // run on the actual landed commit can prove this native qualification.
      const queue =
        /^gh-readonly-queue\/main\/pr-([1-9]\d*)-[a-f0-9]{40}$/.exec(
          run.head_branch || ''
        );
      const native =
        run.event === 'merge_group' &&
        /^[a-f0-9]{40}$/.test(pr.mergeCommitSha || '') &&
        run.head_sha === pr.mergeCommitSha &&
        (run.prNumbers?.includes(pr.number) ||
          Number(queue?.[1]) === pr.number);
      return source || native;
    })
    .toSorted((a, b) => b.id - a.id)[0];
}

export function buildBlogPublishLatency(raw) {
  const deployments = raw.deployments ?? [];
  const mergedPrs = (raw.mergedPrs ?? []).filter(
    pr => pr.mergedAt && pr.mergeCommitSha
  );
  const classifiedPrCount = mergedPrs.filter(pr =>
    Array.isArray(pr.files)
  ).length;
  const samples = (raw.mergedPrs ?? [])
    .filter(pr => pr.mergedAt && pr.mergeCommitSha && isStrictBlogContentPr(pr))
    .map(pr => {
      const timeline = raw.timelines?.[pr.number] ?? [];
      const queueEnteredAt = timeline
        .filter(event => event.type === 'added_to_merge_queue')
        .map(event => event.at)
        .filter(at => Date.parse(at) <= Date.parse(pr.mergedAt))
        .toSorted()
        .at(-1);
      const deploymentAt = deployments
        .filter(
          deployment =>
            deployment.status === 'success' &&
            deployment.sha === pr.mergeCommitSha &&
            Date.parse(deployment.createdAt) >= Date.parse(pr.mergedAt)
        )
        .map(deployment => deployment.createdAt)
        .toSorted()[0];
      const qualification = pr.blogQualification ?? null;
      const confirmedLiveAt = pr.productionVerifiedAt ?? null;
      return {
        pr: pr.number,
        cohort: qualification
          ? 'content-only'
          : pr.blogQualificationConfirmedAbsent === true
            ? 'legacy'
            : 'unknown',
        candidateSha: pr.mergeCommitSha,
        candidateCreatedAt: pr.candidateCreatedAt ?? pr.createdAt,
        qualificationStartedAt: qualification?.startedAt ?? null,
        qualificationEndedAt: qualification?.completedAt ?? null,
        queueEnteredAt: queueEnteredAt ?? null,
        mergedAt: pr.mergedAt,
        deployedAt: deploymentAt ?? null,
        confirmedLiveAt,
        selectedChecks: qualification ? [...BLOG_CONTENT_CHECKS] : [],
        retries: qualification?.retries ?? null,
        cost: {
          runnerSeconds: qualification?.runnerSeconds ?? null,
          buildSeconds: qualification?.buildSeconds ?? null,
        },
        qualificationSeconds: qualification
          ? secondsBetween(qualification.startedAt, qualification.completedAt)
          : null,
        queueWaitSeconds: queueEnteredAt
          ? secondsBetween(queueEnteredAt, pr.mergedAt)
          : null,
        deploymentSeconds: deploymentAt
          ? secondsBetween(pr.mergedAt, deploymentAt)
          : null,
        candidateToLiveSeconds: confirmedLiveAt
          ? secondsBetween(
              pr.candidateCreatedAt ?? pr.createdAt,
              confirmedLiveAt
            )
          : null,
      };
    })
    .toSorted((a, b) => Date.parse(b.mergedAt) - Date.parse(a.mergedAt));

  const legacy = samples.filter(sample => sample.cohort === 'legacy');
  const contentOnly = samples.filter(
    sample => sample.cohort === 'content-only'
  );
  return {
    schema: 'jovie-blog-publish-latency/v1',
    generatedAt: raw.collectedAt ?? new Date().toISOString(),
    sampleCount: samples.length,
    classification: {
      mergedPrCount: mergedPrs.length,
      classifiedPrCount,
      unclassifiedPrCount: mergedPrs.length - classifiedPrCount,
      complete: classifiedPrCount === mergedPrs.length,
    },
    cohorts: {
      legacy: summary(legacy),
      contentOnly: summary(contentOnly),
      unknown: summary(samples.filter(sample => sample.cohort === 'unknown')),
    },
    samples,
    claims: {
      measuredImprovement: null,
      publishingSla: null,
    },
  };
}
