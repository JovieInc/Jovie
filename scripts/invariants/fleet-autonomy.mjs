import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const DEFAULT_ROOT = fileURLToPath(new URL('../../', import.meta.url));

const PATHS = Object.freeze({
  gate: 'scripts/symphony/gem-priority-gate.py',
  drain: 'scripts/drain-pr-queue.sh',
  backend: 'scripts/merge-queue-backend.mjs',
  workflow: '.github/workflows/pr-targets-main.yml',
  admitter: 'scripts/backlog-orchestrator/admitter.mjs',
  command: '.claude/commands/drain.md',
  nur: 'scripts/backlog-orchestrator/no-unattended-red.mjs',
});

const ADVISORY_REVIEW_ENROLL_BLOCK = /needs-human" or \. == "gated"/;
const ADVISORY_REVIEW_SELECTOR = /'needs-human',\s*'gated'/;
const GRAPHITE_LIVE_TRANSPORT = /\bgt\s+(mq|stack|submit|merge)\b/;
const RETIRED_QUEUE_LABEL = /then add `merge-queue`/;

function setIncludesLiteral(source, exportName, value) {
  const initializer = source.match(
    new RegExp(
      `export\\s+const\\s+${exportName}\\s*=\\s*new\\s+Set\\s*\\(\\s*\\[([\\s\\S]*?)\\]\\s*\\)`
    )
  )?.[1];
  if (initializer === undefined) return false;
  const escaped = value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(?:^|[,\\s])['"]${escaped}['"](?:[,\\s]|$)`).test(
    initializer
  );
}

/** JOV-INV-023: fleet observation gaps and non-main PR bases must not freeze shipping. */
export function validateFleetAutonomy(
  repoRoot = DEFAULT_ROOT,
  { readFile = path => readFileSync(resolve(repoRoot, path), 'utf8') } = {}
) {
  const errors = [];
  const gate = readFile(PATHS.gate);
  const drain = readFile(PATHS.drain);
  const backend = readFile(PATHS.backend);
  const workflow = readFile(PATHS.workflow);
  const admitter = readFile(PATHS.admitter);
  const command = readFile(PATHS.command);
  const nur = readFile(PATHS.nur);

  if (!gate.includes('def observe_main_release_ready_jobs')) {
    errors.push(
      'gem-priority-gate.py must observe Main Release Ready from the CI workflow job when check-runs omit it'
    );
  }
  if (
    !gate.includes('queue-observation-gap') ||
    !gate.includes('bound_green_factory')
  ) {
    errors.push(
      'gem-priority-gate.py must treat a missing queue snapshot as an observation gap, not a hold'
    );
  }
  if (!admitter.includes('boundGreenFactory')) {
    errors.push(
      'admitter.mjs must not freeze a bound-green factory on a missing queue snapshot'
    );
  }
  if (/typedReason\(\s*FLEET_GATE_REASON\.QUEUE_UNKNOWN/.test(admitter)) {
    errors.push(
      'admitter.mjs must not treat a queue snapshot gap as a promotion hold'
    );
  }
  if (!drain.includes('RETARGET (base must be main)')) {
    errors.push('drain-pr-queue.sh must retarget non-main PRs onto main');
  }
  if (ADVISORY_REVIEW_ENROLL_BLOCK.test(drain)) {
    errors.push(
      'drain-pr-queue.sh must not skip enrollment for needs-human/gated'
    );
  }
  if (ADVISORY_REVIEW_SELECTOR.test(backend)) {
    errors.push(
      'merge-queue-backend.mjs must not treat needs-human/gated as selector hard holds'
    );
  }
  if (!drain.includes('`hold`, queue-deferred')) {
    errors.push(
      'drain-pr-queue.sh must preserve the explicit founder-controlled hold label'
    );
  }
  if (!setIncludesLiteral(backend, 'HARD_HOLD_LABELS', 'hold')) {
    errors.push(
      'merge-queue-backend.mjs must treat hold as a selector hard hold'
    );
  }
  if (!workflow.includes('name: PR targets main')) {
    errors.push('pr-targets-main.yml must exist as a fail-closed base check');
  }
  if (/branches:\s*\[\s*main/.test(workflow)) {
    errors.push(
      'pr-targets-main.yml must run on every pull_request base, not only main'
    );
  }
  if (!workflow.includes('PRs must target main')) {
    errors.push('pr-targets-main.yml must fail closed when base is not main');
  }
  if (
    GRAPHITE_LIVE_TRANSPORT.test(drain) ||
    GRAPHITE_LIVE_TRANSPORT.test(backend) ||
    GRAPHITE_LIVE_TRANSPORT.test(command)
  ) {
    errors.push(
      'Graphite CLI must not be a landing transport; native GitHub merge queue is the only path'
    );
  }
  if (!command.includes('Graphite and Cursor are gone')) {
    errors.push(
      'drain.md must record that Graphite and Cursor apps are removed'
    );
  }
  if (RETIRED_QUEUE_LABEL.test(command)) {
    errors.push(
      'drain.md must not instruct adding the retired merge-queue label'
    );
  }
  if (
    !nur.includes("['fleet-observation-gap'") ||
    !nur.includes("['base-not-main'")
  ) {
    errors.push(
      'no-unattended-red.mjs must classify fleet-observation-gap and base-not-main so they cannot go undetected'
    );
  }
  return errors;
}
