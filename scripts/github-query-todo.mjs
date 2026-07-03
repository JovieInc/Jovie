#!/usr/bin/env node
/**
 * List open GitHub issues ready for agent dispatch (label: agent-ready).
 *
 * Usage:
 *   node scripts/github-query-todo.mjs
 *
 * Prints TSV rows: number, updatedAt, title
 * Exits 0 on success (including empty), 1 on gh failure.
 * Mirrors scripts/linear-query-todo.mjs filtering semantics.
 */

import { queryTodoIssues } from './lib/tracker.mjs';

const repo = process.env.GITHUB_REPOSITORY;
const result = queryTodoIssues({ repo, limit: 40 });

if (!result.success) {
  console.error(result.error ?? 'query failed');
  process.exit(1);
}

for (const issue of result.issues) {
  console.log(
    [issue.number, issue.updatedAt ?? '', issue.title ?? ''].join('\t')
  );
}