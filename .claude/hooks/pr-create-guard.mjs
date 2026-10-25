#!/usr/bin/env node
// PreToolUse(Bash): the raw GitHub CLI create-PR command is blocked; scripts/pr-create.mjs is the same command with the PR body
// preflight (customer-changelog decision, Red-before-green, Storybook story) run locally first. Exit 2 blocks.
import { readFileSync } from "node:fs";

// Assembled from parts: this is a detector of the command, not a call to it.
export const RAW_CREATE = new RegExp(`(?:^|[;&|(\\s])${["gh", "pr", "create"].join("\\s+")}\\b`);
export const WRAPPED = /scripts\/pr-create\.mjs|pnpm\s+(?:run\s+)?pr:create/;
export const GUIDANCE =
  "Use `node scripts/pr-create.mjs` instead of the raw CLI create command (same flags). Start the body from " +
  "`node scripts/pr-create.mjs --print-template --title \"<title>\" [--identifier JOV-n --issue-id <uuid>]`; it carries the " +
  "customer-changelog block and the Blast radius / Red-before-green sections. The wrapper runs the same rules as CI locally " +
  "and refuses to create the PR with the exact text to add.";

export const violates = command => RAW_CREATE.test(command) && !WRAPPED.test(command);

if (import.meta.url === `file://${process.argv[1]}`) {
  let command = "";
  try {
    command = JSON.parse(readFileSync(0, "utf8"))?.tool_input?.command ?? "";
  } catch {
    process.exit(0);
  }
  if (violates(command)) {
    process.stderr.write(`BLOCKED: raw gh pr create. ${GUIDANCE}\n`);
    process.exit(2);
  }
}
