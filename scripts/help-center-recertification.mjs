#!/usr/bin/env node

import { execFileSync } from 'node:child_process';
import {
  findAffectedArticles,
  parseFeatureRegistry,
  parseFrontmatter,
  parseProductRoutes,
  validateArticleMetadata,
} from '../apps/docs/lib/article-metadata.mjs';
import { upsertLinearIssueByTitleFingerprint } from './lib/linear-issue-intake.mjs';

function git(args) {
  return execFileSync('git', args, { encoding: 'utf8' });
}

function readRevisionFile(revision, path, gitImpl) {
  return gitImpl(['show', `${revision}:${path}`]);
}

function listRevisionArticles(revision, gitImpl) {
  return gitImpl([
    'ls-tree',
    '-r',
    '--name-only',
    revision,
    '--',
    'apps/docs/app',
  ])
    .split('\n')
    .filter(path => path.endsWith('/page.mdx'))
    .sort();
}

export function readCertificationSnapshot(
  revision,
  {
    allowInvalid = false,
    allowDanglingRegistryRefs = false,
    gitImpl = git,
  } = {}
) {
  const features = parseFeatureRegistry(
    readRevisionFile(revision, 'docs/FEATURE_REGISTRY.md', gitImpl)
  );
  const routes = parseProductRoutes(
    readRevisionFile(revision, 'apps/web/constants/routes.ts', gitImpl)
  );
  const articles = [];

  for (const sourcePath of listRevisionArticles(revision, gitImpl)) {
    try {
      const { metadata } = parseFrontmatter(
        readRevisionFile(revision, sourcePath, gitImpl),
        sourcePath
      );
      try {
        validateArticleMetadata(metadata, { features, routes, sourcePath });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        if (
          !allowDanglingRegistryRefs ||
          !/unknown (featureId|productRoute):/.test(message)
        ) {
          throw error;
        }
      }
      articles.push(metadata);
    } catch (error) {
      if (!allowInvalid) throw error;
    }
  }

  return { articles, features, routes };
}

export function buildRecertificationIssue({ article, affected, base, head }) {
  const fingerprint = `docs-recert:${article.id}`;
  const reasons = [...affected.reasons].sort();
  return {
    fingerprint,
    title: `[${fingerprint}] Recertify Help Center guide: ${article.title}`,
    description: `## Source
- Article: \`${article.id}\`
- Product change: \`${base}..${head}\`
- Current status: \`${article.status}\`

## Deterministic triggers
${reasons.map(reason => `- \`${reason}\``).join('\n')}

## Required review
- Re-run the guide against the exact candidate build and current product route.
- Confirm every declared UI label and capability state from source and observed behavior.
- Update \`lastVerifiedAt\`, \`verifiedBy\`, and visual proof references in the article frontmatter.
- V1 launch-path guides require a human verifier; source tests alone are not certification.

## Acceptance
- The article is corrected and human-certified with current proof, or moved to \`stale\`/\`retired\` so navigation, search, sitemap, and related guides quarantine it.
- The metadata validator and affected-article simulation pass.
`,
  };
}

export async function syncRecertificationIssues({
  affected,
  articles,
  base,
  head,
  apiKey = process.env.LINEAR_API_KEY,
  upsert = upsertLinearIssueByTitleFingerprint,
}) {
  const articlesById = new Map(articles.map(article => [article.id, article]));
  const results = [];
  for (const item of affected
    .filter(entry => entry.needsRecertification)
    .sort((a, b) => a.articleId.localeCompare(b.articleId))) {
    const article = articlesById.get(item.articleId);
    if (!article) continue;
    const issue = buildRecertificationIssue({
      article,
      affected: item,
      base,
      head,
    });
    const result = await upsert({
      ...issue,
      priority: 2,
      createStateName: 'Todo',
      reopenTerminal: true,
      apiKey,
    });
    if (!result.ok) {
      throw new Error(
        `documentation review issue failed for ${item.articleId}: ${result.reason}`
      );
    }
    results.push({ articleId: item.articleId, ...result });
  }
  return results;
}

export function evaluateRevisionChange({ base, head, gitImpl = git }) {
  const before = readCertificationSnapshot(base, {
    allowInvalid: true,
    gitImpl,
  });
  const after = readCertificationSnapshot(head, {
    allowDanglingRegistryRefs: true,
    gitImpl,
  });
  const changedPaths = gitImpl(['diff', '--name-only', base, head])
    .split('\n')
    .filter(Boolean)
    .sort();
  const affected = findAffectedArticles({
    beforeArticles: before.articles,
    afterArticles: after.articles,
    beforeFeatures: before.features,
    afterFeatures: after.features,
    beforeRoutes: before.routes,
    afterRoutes: after.routes,
    changedPaths,
  });
  return { base, head, changedPaths, affected, articles: after.articles };
}

function argument(name) {
  const index = process.argv.indexOf(name);
  return index === -1 ? null : process.argv[index + 1];
}

async function main() {
  const base = argument('--base');
  const head = argument('--head');
  if (!base || !head) {
    throw new Error(
      'usage: help-center-recertification --base <sha> --head <sha> [--sync-linear]'
    );
  }
  const evaluation = evaluateRevisionChange({ base, head });
  const issues = process.argv.includes('--sync-linear')
    ? await syncRecertificationIssues(evaluation)
    : [];
  process.stdout.write(
    `${JSON.stringify({ ...evaluation, articles: undefined, issues })}\n`
  );
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(error => {
    process.stderr.write(
      `${error instanceof Error ? error.message : String(error)}\n`
    );
    process.exit(1);
  });
}
