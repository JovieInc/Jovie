#!/usr/bin/env node
/** Materialize one capacity-bound routing receipt for an already-leased issue. */

import { readFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import { pathToFileURL } from 'node:url';

const EXIT_CONFIG = 78;

function issueWithReceipt(issue, body) {
  const comments = issue?.comments?.nodes || issue?.comments || [];
  return {
    ...issue,
    comments: {
      nodes: [...comments, { body }],
    },
  };
}

export async function prepareSymphonyRoute({
  issueIdentifier,
  workspaceDir,
  issueFile,
  routing,
  tracker,
}) {
  let issue;
  if (issueFile) {
    issue = JSON.parse(readFileSync(issueFile, 'utf8'));
  } else {
    issue = await tracker.fetchIssue(issueIdentifier);
  }
  if (!issue) throw new Error('issue-not-found:' + issueIdentifier);
  if (issue.identifier !== issueIdentifier) {
    throw new Error(
      'leased-issue-evidence-mismatch:' +
        (issue.identifier || 'missing') +
        ':' +
        issueIdentifier
    );
  }

  const capacity = routing.readCodexRotateCapacity();
  if (!capacity || capacity.accounts === 0) {
    throw new Error('codex-capacity-evidence-unavailable');
  }
  if (capacity.ready === 0) throw new Error('codex-capacity-not-ready');

  let materialized = routing.materializeRoutingReceipt(issue, workspaceDir, {
    requireCapacityEvidence: true,
  });
  let source = 'existing-receipt';
  if (!materialized) {
    const decision = routing.selectSymphonyRoute({ issue, capacity });
    if (decision.status !== 'selected') {
      throw new Error('route-not-selected:' + (decision.reason || 'unknown'));
    }
    const body = routing.buildRoutingReceipt(decision.route);
    const response = await tracker.addComment(issue.id, body);
    if (response?.commentCreate?.success !== true) {
      throw new Error('routing-receipt-comment-not-persisted');
    }

    // The successful mutation is authoritative evidence for this process. Add
    // it to the leased issue snapshot and verify/materialize locally instead
    // of spending another shared Linear request merely to read it back.
    issue = issueWithReceipt(issue, body);
    materialized = routing.materializeRoutingReceipt(issue, workspaceDir, {
      requireCapacityEvidence: true,
    });
    source = 'created-receipt';
  }
  if (!materialized) throw new Error('routing-receipt-not-materialized');
  return { ...materialized, source };
}

async function main() {
  const workspaceDir = process.env.SYMPHONY_WORKSPACE || process.cwd();
  const issueIdentifier =
    process.env.SYMPHONY_ISSUE_IDENTIFIER || basename(workspaceDir);
  const routing = await import(
    pathToFileURL(
      join(workspaceDir, 'scripts/backlog-orchestrator/symphony-routing.mjs')
    ).href
  );
  let trackerModule;
  const loadTracker = () => {
    trackerModule ||= import(
      pathToFileURL(
        join(workspaceDir, 'scripts/backlog-orchestrator/linear-client.mjs')
      ).href
    );
    return trackerModule;
  };
  const tracker = {
    fetchIssue: async identifier =>
      (await loadTracker()).fetchIssue(identifier),
    addComment: async (issueId, body) =>
      (await loadTracker()).addComment(issueId, body),
  };
  const result = await prepareSymphonyRoute({
    issueIdentifier,
    workspaceDir,
    issueFile: process.env.SYMPHONY_ROUTING_ISSUE_FILE,
    routing,
    tracker,
  });
  process.stdout.write(
    'ROUTE_ADMITTED schema=symphony-routing/v1 issue=' +
      issueIdentifier +
      ' model=' +
      result.receipt.model +
      ' source=' +
      result.source +
      '\n'
  );
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  try {
    await main();
  } catch (error) {
    const reason = String(error?.message || error || 'route-preparation-failed')
      .replace(/\s+/g, ' ')
      .slice(0, 240);
    process.stderr.write(
      'ROUTE_REJECTED schema=symphony-routing/v1 retryable=false reason=' +
        JSON.stringify(reason) +
        '\n'
    );
    process.exitCode = EXIT_CONFIG;
  }
}
