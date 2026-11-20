import { githubRequest } from './merge-group-member-policy.mjs';
import {
  evaluatePrSizePolicy,
  INTEGRATION_TRAIN_LABEL,
  parseLabels,
  verifyIntegrationTrainSourceCoverage,
} from './pr-size-guard-policy.mjs';
import { SIZE_GUARD_API_BUDGET_MS } from './size-guard-github.mjs';

export async function runSizeGuard() {
  const result = evaluatePrSizePolicy({
    labels: parseLabels(process.env.PR_LABELS),
    body: process.env.PR_BODY,
    lines: Number(process.env.PR_LINES),
    files: Number(process.env.PR_FILES),
    maxLines: Number(process.env.MAX_LINES),
    maxFiles: Number(process.env.MAX_FILES),
  });

  const sourceSummary = result.sources.length
    ? result.sources.map(source => `#${source}`).join(', ')
    : 'none';
  if (process.env.GITHUB_STEP_SUMMARY) {
    const { appendFileSync } = await import('node:fs');
    appendFileSync(
      process.env.GITHUB_STEP_SUMMARY,
      [
        '### PR Size Guard',
        '',
        `Policy: **${result.policy}**`,
        '',
        '| metric (excl. generated/lock) | value | cap |',
        '|---|---|---|',
        `| changed lines | ${process.env.PR_LINES} | ${result.capLines} |`,
        `| changed files | ${process.env.PR_FILES} | ${result.capFiles} |`,
        `| component PRs | ${sourceSummary} | ${result.policy === INTEGRATION_TRAIN_LABEL ? '>=2' : 'n/a'} |`,
        '',
        result.passed ? `✅ ${result.reason}` : `> ❌ ${result.reason}`,
        '',
      ].join('\n')
    );
  }
  console.log(
    `${result.passed ? '✅' : '❌'} ${result.reason} (${process.env.PR_LINES} lines / ${process.env.PR_FILES} files; cap ${result.capLines}/${result.capFiles})`
  );
  if (!result.passed) {
    process.exitCode = 1;
  } else if (result.policy === INTEGRATION_TRAIN_LABEL) {
    const { appendFileSync } = await import('node:fs');
    const repo = process.env.REPO ?? process.env.GITHUB_REPOSITORY;
    const trainNumber = Number(process.env.PR);
    if (!repo || !Number.isInteger(trainNumber) || trainNumber <= 0) {
      throw new Error('integration-train source coverage requires REPO and PR');
    }
    // One budget for the complete source-coverage policy, including pagination.
    const deadlineMs = Date.now() + SIZE_GUARD_API_BUDGET_MS;
    const ghJson = async (endpoint, paginate = false) => {
      const pages = [];
      for (let page = 1; page <= 30; page += 1) {
        const { data, link } = await githubRequest(
          `/repos/${repo}/${endpoint}${paginate ? `&page=${page}` : ''}`,
          {
            token: process.env.GH_TOKEN || process.env.GITHUB_TOKEN,
            deadlineMs,
          }
        );
        if (!paginate) return data;
        if (!Array.isArray(data))
          throw new Error('Size Guard file page is malformed');
        pages.push(...data);
        if (!link || !/<[^>]+>;\s*rel="next"/.test(link)) return pages;
      }
      throw new Error('Size Guard file pagination exceeded 30 pages');
    };
    try {
      const coverage = await verifyIntegrationTrainSourceCoverage({
        body: process.env.PR_BODY,
        trainNumber,
        loadPull: number => ghJson(`pulls/${number}`),
        loadFiles: async number =>
          (await ghJson(`pulls/${number}/files?per_page=100`, true)).map(
            file => file.filename
          ),
      });
      const coverageSummary = coverage
        .map(item => {
          const omissionSummary = item.omissionPaths.length
            ? `; EXPLICIT OMISSIONS: ${item.omissionPaths.join(', ')}`
            : '';
          return `#${item.number}@${item.headSha.slice(0, 12)} (${item.covered} covered, ${item.omitted} omitted${omissionSummary})`;
        })
        .join('; ');
      console.log(`✅ source coverage verified: ${coverageSummary}`);
      if (process.env.GITHUB_STEP_SUMMARY) {
        appendFileSync(
          process.env.GITHUB_STEP_SUMMARY,
          `\n✅ Source coverage verified: ${coverageSummary}\n`
        );
      }
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : 'unknown source coverage error';
      if (process.env.GITHUB_STEP_SUMMARY) {
        appendFileSync(
          process.env.GITHUB_STEP_SUMMARY,
          `\n> ❌ Source coverage failed: ${message}\n`
        );
      }
      throw error;
    }
  }
}
