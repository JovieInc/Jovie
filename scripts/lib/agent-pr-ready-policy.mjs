// biome-ignore-all format: keep the focused policy within the PR size guard.
import { readFileSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const TRUSTED_EVIDENCE_LOGINS = ['itstimwhite'];
const TRUSTED_EVIDENCE_ASSOCIATIONS = ['OWNER', 'MEMBER', 'COLLABORATOR'];
const AGENT_BRANCH_PREFIXES = ['linear/', 'claude/', 'codegen-bot/', 'codex/', 'agent/'];
const HOLD_LABELS = ['needs-human', 'hold', 'gated', 'queue-deferred', 'fast'];
function normalizeText(value) {
  return typeof value === 'string' ? value.trim() : '';
}
function normalizeAssociation(value) { return normalizeText(value).toUpperCase(); }
function labelName(label) { return typeof label === 'string' ? label : normalizeText(label?.name); }
export function isAgentBranch(ref) {
  const branch = normalizeText(ref);
  // Dependabot is intentionally a normal automation PR, not an evidence-producing agent.
  if (branch.startsWith('dependabot/')) return false;
  return AGENT_BRANCH_PREFIXES.some(prefix => branch.startsWith(prefix)) || /^[^/]+\/jov-/i.test(branch);
}
export function isTrustedEvidenceProducer({ login, association }) {
  return (
    TRUSTED_EVIDENCE_LOGINS.includes(normalizeText(login)) && TRUSTED_EVIDENCE_ASSOCIATIONS.includes(normalizeAssociation(association))
  );
}

export function assertTrustedTrigger(trigger) {
  if (!TRUSTED_EVIDENCE_LOGINS.includes(normalizeText(trigger?.actor)) || !isTrustedEvidenceProducer(trigger)) {
    throw new Error('comment reevaluation trigger is not trusted');
  }
}

export function getAgentPrEligibilityErrors({ pr, repository, expectedHeadSha, expectedDraft, allowHoldLabels = false }) {
  const errors = [];
  const headRepository = normalizeText(pr?.head?.repo?.full_name);
  const headRef = normalizeText(pr?.head?.ref);
  const headSha = normalizeText(pr?.head?.sha);
  const baseRepository = normalizeText(pr?.base?.repo?.full_name);
  const baseRef = normalizeText(pr?.base?.ref);
  const author = { login: pr?.user?.login, association: pr?.author_association };
  const holdLabels = (pr?.labels ?? []).map(labelName).filter(label => HOLD_LABELS.includes(label));

  if (!repository || headRepository !== repository) errors.push('pull request head must belong to the current repository');
  if (baseRepository !== repository || baseRef !== 'main') errors.push('pull request base must be main in the current repository');
  if (!isAgentBranch(headRef)) errors.push('pull request head must use an approved agent branch prefix');
  if (!isTrustedEvidenceProducer(author)) errors.push('pull request author is not an approved evidence producer');
  if (!expectedHeadSha || headSha !== expectedHeadSha) errors.push('pull request head does not match the expected exact SHA');
  if (typeof expectedDraft === 'boolean' && pr?.draft !== expectedDraft) {
    errors.push(expectedDraft ? 'pull request is no longer draft' : 'pull request was not promoted from draft');
  }
  if (!allowHoldLabels && holdLabels.length > 0) {
    errors.push(`pull request has hold labels: ${holdLabels.join(', ')}`);
  }

  return errors;
}

export function classifyAgentPr({ pr, repository, expectedHeadSha }) {
  if (normalizeText(pr?.head?.sha) !== expectedHeadSha) throw new Error('pull request head does not match the expected exact SHA');
  if (!isAgentBranch(pr?.head?.ref)) return 'non-agent';
  return getAgentPrEligibilityErrors({ pr, repository, expectedHeadSha, allowHoldLabels: true }).length === 0
    ? 'eligible-agent' : 'agent-unapproved';
}

function assertEligibleAgentPr(options) {
  const errors = getAgentPrEligibilityErrors(options);
  if (errors.length > 0) throw new Error(errors.join('; '));
}

export function buildTrustedEvidenceMarkdown({ pr, triggerComment, repository, expectedHeadSha, trigger }) {
  assertEligibleAgentPr({ pr, repository, expectedHeadSha, expectedDraft: true });

  if (!trigger) return '';

  assertTrustedTrigger(trigger);
  if (
    normalizeText(triggerComment?.user?.login) !== normalizeText(trigger.login) ||
    normalizeAssociation(triggerComment?.author_association) !== normalizeAssociation(trigger.association)
  ) {
    throw new Error('trigger actor and comment provenance do not match');
  }

  return normalizeText(triggerComment?.body);
}

export function assertReadyState({ pr, repository, expectedHeadSha, phase }) {
  if (phase !== 'before' && phase !== 'after') throw new Error(`unsupported readiness phase: ${phase}`);

  assertEligibleAgentPr({ pr, repository, expectedHeadSha, expectedDraft: phase === 'before' });
}

export function assertRedraftEligibility({ pr, repository, expectedHeadSha }) {
  assertEligibleAgentPr({ pr, repository, expectedHeadSha, allowHoldLabels: true });
}

function parseArguments(argv) {
  const [command, ...rest] = argv;
  const values = new Map();
  for (let index = 0; index < rest.length; index += 2) {
    const flag = rest[index];
    const value = rest[index + 1];
    if (!flag?.startsWith('--') || value === undefined) {
      throw new Error(`invalid argument near ${flag ?? '<end>'}`);
    }
    values.set(flag.slice(2), value);
  }
  return { command, values };
}

function required(values, name) {
  const value = normalizeText(values.get(name));
  if (!value) throw new Error(`missing required --${name}`);
  return value;
}
function readJsonFile(path) { return JSON.parse(readFileSync(path, 'utf8')); }

function runCli(argv) {
  const { command, values } = parseArguments(argv);
  if (command === 'check-trigger') {
    assertTrustedTrigger({ actor: required(values, 'trigger-actor'), login: required(values, 'trigger-login'),
      association: required(values, 'trigger-association') });
    return;
  }

  const repository = required(values, 'repository');
  const expectedHeadSha = required(values, 'expected-head-sha');
  const pr = readJsonFile(required(values, 'pr-json'));

  if (command === 'classify') {
    process.stdout.write(`${classifyAgentPr({ pr, repository, expectedHeadSha })}\n`);
    return;
  }

  if (command === 'collect-evidence') {
    const trigger = { actor: required(values, 'trigger-actor'), login: required(values, 'trigger-login'),
      association: required(values, 'trigger-association') };
    const markdown = buildTrustedEvidenceMarkdown({
      pr,
      triggerComment: readJsonFile(required(values, 'trigger-comment-json')),
      repository,
      expectedHeadSha,
      trigger,
    });
    writeFileSync(required(values, 'evidence-file'), markdown);
    return;
  }

  if (command === 'check-state') {
    assertReadyState({
      pr,
      repository,
      expectedHeadSha,
      phase: required(values, 'phase'),
    });
    return;
  }

  if (command === 'check-redraft') {
    assertRedraftEligibility({ pr, repository, expectedHeadSha });
    return;
  }

  throw new Error(`unsupported command: ${command ?? '<missing>'}`);
}

const isDirectExecution = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;

if (isDirectExecution) {
  try {
    runCli(process.argv.slice(2));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`Agent PR readiness policy rejected input: ${message}\n`);
    process.exitCode = 1;
  }
}
