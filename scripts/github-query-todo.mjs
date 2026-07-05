#!/usr/bin/env node
import { queryTodoIssues } from './lib/tracker.mjs';

const repo = process.env.GH_REPO ?? process.env.GITHUB_REPOSITORY;
const limit = Number.parseInt(process.env.TRACKER_QUERY_LIMIT ?? '40', 10);
const readyLabel = process.env.READY_LABEL ?? process.env.TRACKER_READY_LABEL;

const result = queryTodoIssues({
  repo,
  limit: Number.isFinite(limit) ? limit : 40,
  readyLabel,
});

if (!result.success) {
  console.error(result.error ?? 'query failed');
  process.exit(1);
}

for (const issue of result.issues) {
  const labels = (issue.labels ?? []).map(label => label.name).join(',');
  console.log([`#${issue.number}`, labels, issue.title].join('\t'));
}
