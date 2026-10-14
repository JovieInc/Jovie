#!/usr/bin/env node
/** Read-only Linear reconciliation and GBrain mirror report for scheduled runs. */

import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parseFrontmatter } from './postmortem-linkage-check.mjs';
import {
  buildReviewReport,
  fetchLinearIssueAudit,
  mirrorPostmortem,
  readClassActionRegistry,
  readPostmortemDocuments,
} from './postmortem-review.mjs';

function unique(values) {
  return [...new Set(values)];
}

function parseArgs(argv) {
  const args = {};
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (value.startsWith('--')) args[value.slice(2)] = argv[++index];
  }
  return args;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const repoRoot = args.root ? resolve(args.root) : process.cwd();
  const documents = readPostmortemDocuments(repoRoot);
  const classActionRegistry = readClassActionRegistry(repoRoot);
  const actionIds = unique([
    ...documents.flatMap(document => {
      const meta = parseFrontmatter(document.source) ?? {};
      return Array.isArray(meta.actions) ? meta.actions : [];
    }),
    ...Object.values(classActionRegistry).map(action => action.issue),
  ]);
  const issueAudit = process.env.LINEAR_API_KEY
    ? await fetchLinearIssueAudit(actionIds, process.env.LINEAR_API_KEY)
    : {};
  const mirrors = {};
  for (const document of documents) {
    mirrors[document.path] = await mirrorPostmortem(document);
  }
  const report = buildReviewReport({
    documents,
    issueAudit,
    classActionRegistry,
    mirrors,
  });
  const output = `${JSON.stringify(report, null, 2)}\n`;
  if (args.out) writeFileSync(resolve(args.out), output);
  process.stdout.write(output);
}

main().catch(error => {
  process.stderr.write(`postmortem-review-report: ${error.message}\n`);
  process.exitCode = 1;
});
