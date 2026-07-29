import { appendFileSync, readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const WORKFLOW_DIRECTORY = '.github/workflows';
const TRUSTED_BASE_REF = /github\.event\.pull_request\.base\.(?:ref|sha)/;
const UNTRUSTED_PULL_REQUEST_REF =
  /github\.event\.pull_request\.(?:head\.(?:ref|sha)|head\.repo)/;
const WORKFLOW_RUN_HEAD_REF = /github\.event\.workflow_run\.head_sha/;

function checkoutRefs(workflow) {
  const lines = workflow.split('\n');
  const refs = [];

  for (let index = 0; index < lines.length; index += 1) {
    if (!/uses:\s+actions\/checkout@/.test(lines[index])) continue;

    for (let cursor = index + 1; cursor < lines.length; cursor += 1) {
      if (/^\s*-\s/.test(lines[cursor])) break;
      const ref = lines[cursor].match(/^\s*ref:\s*(.+)$/);
      if (ref) refs.push(ref[1].trim());
    }
  }

  return refs;
}

export function auditWorkflowExecution(workflowFiles) {
  const findings = [];
  const privilegedWorkflows = [];

  for (const [name, workflow] of Object.entries(workflowFiles)) {
    const hasPullRequestTarget = /^\s*pull_request_target:\s*$/m.test(workflow);
    const hasWorkflowRun = /^\s*workflow_run:\s*$/m.test(workflow);
    if (!hasPullRequestTarget && !hasWorkflowRun) continue;

    const refs = checkoutRefs(workflow);
    const unsafePullRequestRefs = hasPullRequestTarget
      ? refs.filter(ref => UNTRUSTED_PULL_REQUEST_REF.test(ref))
      : [];
    const workflowRunHeadRefs = hasWorkflowRun
      ? refs.filter(ref => WORKFLOW_RUN_HEAD_REF.test(ref))
      : [];

    for (const ref of unsafePullRequestRefs) {
      findings.push({
        level: 'warning',
        workflow: name,
        message: `pull_request_target checks out untrusted pull request code (${ref})`,
      });
    }

    privilegedWorkflows.push({
      name,
      hasPullRequestTarget,
      hasWorkflowRun,
      usesTrustedPullRequestBase: refs.some(ref => TRUSTED_BASE_REF.test(ref)),
      unsafePullRequestRefs,
      workflowRunHeadRefs,
    });
  }

  return { findings, privilegedWorkflows };
}

function emitAnnotation(level, title, message) {
  const escaped = message
    .replaceAll('%', '%25')
    .replaceAll('\r', '%0D')
    .replaceAll('\n', '%0A');
  console.log(`::${level} title=${title}::${escaped}`);
}

function writeSummary(audit) {
  const lines = [
    '## Workflow execution trust-boundary audit',
    '',
    'Advisory only. This job is intentionally not a required PR or merge-queue check.',
    '',
    `Privileged-event workflows inspected: ${audit.privilegedWorkflows.length}`,
  ];

  for (const workflow of audit.privilegedWorkflows) {
    const events = [
      workflow.hasPullRequestTarget && 'pull_request_target',
      workflow.hasWorkflowRun && 'workflow_run',
    ]
      .filter(Boolean)
      .join(', ');
    const workflowRunDetail = workflow.workflowRunHeadRefs.length
      ? ', exact triggering head checkout'
      : '';
    lines.push(`- \`${workflow.name}\` (${events}${workflowRunDetail})`);
  }

  lines.push('', '### Findings');
  if (audit.findings.length === 0) {
    lines.push(
      '- No `pull_request_target` workflow checks out an untrusted pull-request ref.'
    );
  } else {
    for (const finding of audit.findings) {
      lines.push(
        `- **${finding.level}** \`${finding.workflow}\`: ${finding.message}`
      );
    }
  }

  lines.push(
    '',
    'GitHub Actions workflow execution protections remain an administrator-configured policy. Start in **Evaluate** mode before enforcing actor or event allowlists.'
  );

  if (process.env.GITHUB_STEP_SUMMARY) {
    appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${lines.join('\n')}\n`);
  }

  console.log(lines.join('\n'));
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const root = process.cwd();
  const workflowsPath = resolve(root, WORKFLOW_DIRECTORY);
  const workflowFiles = Object.fromEntries(
    readdirSync(workflowsPath)
      .filter(file => file.endsWith('.yml') || file.endsWith('.yaml'))
      .sort()
      .map(file => [file, readFileSync(resolve(workflowsPath, file), 'utf8')])
  );
  const audit = auditWorkflowExecution(workflowFiles);

  for (const finding of audit.findings) {
    emitAnnotation(
      finding.level,
      'Workflow execution posture',
      `${finding.workflow}: ${finding.message}`
    );
  }
  writeSummary(audit);
}
