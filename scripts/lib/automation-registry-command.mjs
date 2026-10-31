import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  checkAutomationProposal,
  checkRegistryCoverage,
  discoverScheduledAutomations,
  isScheduleSource,
  parseRegistry,
  REGISTRY_PATH,
} from './automation-registry.mjs';
import { validateRegistryTransition } from './automation-registry-policy.mjs';

const SHA = /^[0-9a-f]{40}$/;

/** Bind the checked trees to GitHub's event, never a proposal-supplied base. */
function registryRange(repoRoot, env) {
  const gitRaw = (...args) =>
    execFileSync('git', ['--no-replace-objects', ...args], {
      cwd: repoRoot,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
  const git = (...args) => gitRaw(...args).trim();
  const headSha = git('rev-parse', 'HEAD');
  let baseSha;
  let candidateTree = headSha;
  const ancestor = (base, head) =>
    git('merge-base', '--is-ancestor', base, head);
  const exact = value => {
    if (!SHA.test(value ?? '') || /^0+$/.test(value))
      throw new Error('missing or invalid exact base/head SHA');
    return value;
  };
  const localPreflight =
    env.GITHUB_ACTIONS !== 'true' &&
    !env.GITHUB_EVENT_PATH &&
    env.CI_BASE_REF &&
    env.SHADCN_LINT_DIFF_BASE;
  if (!env.GITHUB_EVENT_NAME || localPreflight) {
    if (env.GITHUB_ACTIONS === 'true')
      throw new Error('missing GitHub admission event');
    baseSha = git(
      'merge-base',
      localPreflight ? env.CI_BASE_REF : 'origin/main',
      headSha
    );
    if (localPreflight && exact(env.SHADCN_LINT_DIFF_BASE) !== baseSha)
      throw new Error('local preflight base does not bind this checkout');
    if (baseSha === headSha) baseSha = git('rev-parse', `${headSha}^1`);
  } else {
    const event = JSON.parse(readFileSync(env.GITHUB_EVENT_PATH, 'utf8'));
    if (
      !env.GITHUB_REPOSITORY ||
      event.repository?.full_name !== env.GITHUB_REPOSITORY
    )
      throw new Error('event repository does not bind this checkout');
    if (env.GITHUB_EVENT_NAME === 'pull_request') {
      const pr = event.pull_request;
      if (
        pr?.base?.repo?.full_name !== env.GITHUB_REPOSITORY ||
        !env.GITHUB_BASE_REF ||
        pr.base.ref !== env.GITHUB_BASE_REF
      )
        throw new Error(
          'pull request base repository/ref does not match runner'
        );
      baseSha = exact(pr.base.sha);
      const sourceHead = exact(pr.head?.sha);
      if (headSha === sourceHead) {
        if (
          exact(env.GITHUB_SHA) !== headSha &&
          env.GITHUB_SHA !== exact(pr.merge_commit_sha)
        )
          throw new Error(
            'source checkout does not bind the pull request event head'
          );
        if (
          env.SOURCE_GUARD_PREPARED === 'true' ||
          (env.SOURCE_GUARD_PREPARED === 'false' &&
            env.EXPECTED_HEAD === sourceHead)
        ) {
          const trusted =
            env.SOURCE_GUARD_PREPARED === 'true'
              ? exact(env.SOURCE_GUARD_TRUSTED_REF)
              : git('rev-parse', `origin/${env.GITHUB_BASE_REF}^{commit}`);
          if (
            trusted !==
            git('rev-parse', `origin/${env.GITHUB_BASE_REF}^{commit}`)
          )
            throw new Error(
              'prepared source base does not match the trusted ref'
            );
          ancestor(baseSha, trusted);
          baseSha = trusted;
        }
        candidateTree = exact(
          git('merge-tree', '--write-tree', baseSha, headSha)
        );
      } else {
        if (exact(env.GITHUB_SHA) !== headSha)
          throw new Error('event head does not bind this checkout');
        const parents = git('show', '-s', '--format=%P', headSha).split(' ');
        if (parents.length !== 2 || parents[1] !== sourceHead)
          throw new Error(
            'checkout is not the exact pull request head or its merge tree'
          );
        // GitHub may retain an older base.sha on synchronize. Its ancestor
        // must bind the actual first parent of the checked merge tree.
        ancestor(baseSha, parents[0]);
        baseSha = parents[0];
      }
    } else if (env.GITHUB_EVENT_NAME === 'merge_group') {
      baseSha = exact(event.merge_group?.base_sha);
      if (
        exact(env.GITHUB_SHA) !== headSha ||
        exact(event.merge_group?.head_sha) !== headSha
      )
        throw new Error('merge group head does not bind this checkout');
    } else if (env.GITHUB_EVENT_NAME === 'push') {
      baseSha = exact(event.before);
      if (exact(env.GITHUB_SHA) !== headSha || exact(event.after) !== headSha)
        throw new Error('push head does not bind this checkout');
    } else if (env.GITHUB_EVENT_NAME === 'workflow_dispatch') {
      if (exact(env.GITHUB_SHA) !== headSha)
        throw new Error('event head does not bind this checkout');
      baseSha = git('rev-parse', `${headSha}^1`);
    } else
      throw new Error(
        `unsupported registry admission event: ${env.GITHUB_EVENT_NAME}`
      );
  }
  exact(baseSha);
  if (baseSha === headSha)
    throw new Error('base and candidate must be distinct commits');
  if (candidateTree === headSha) ancestor(baseSha, headSha);
  const baseText = gitRaw('show', `${baseSha}:${REGISTRY_PATH}`);
  const headText = gitRaw('show', `${candidateTree}:${REGISTRY_PATH}`);
  const sources = new Map(
    git('ls-tree', '-r', '--name-only', '-z', candidateTree)
      .split('\0')
      .filter(isScheduleSource)
      .map(file => [file, gitRaw('show', `${candidateTree}:${file}`)])
  );
  const text = readFileSync(join(repoRoot, REGISTRY_PATH), 'utf8');
  if (text !== headText)
    throw new Error('working registry differs from the bound candidate commit');
  return {
    baseSha,
    headSha,
    candidateTree,
    sources,
    base: parseRegistry(baseText),
    candidate: parseRegistry(text),
    text,
  };
}

/** Supported agent pre-create surface; shares validation and CI tests above. */
export function registryCommand(
  args,
  repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..'),
  env = process.env
) {
  const transition = args.length === 1 && args[0] === 'check-change';
  if (
    !transition &&
    (args.length !== 3 ||
      args[0] !== 'can-create' ||
      args[1] !== '--proposal' ||
      !args[2])
  ) {
    return {
      ok: false,
      errors: [
        'usage: node scripts/lib/automation-registry.mjs check-change | can-create --proposal <entry.json>',
      ],
    };
  }
  try {
    if (transition) {
      const {
        baseSha,
        headSha,
        candidateTree,
        sources,
        base,
        candidate,
        text,
      } = registryRange(repoRoot, env);
      const errors = [
        ...validateRegistryTransition(base, candidate),
        ...checkRegistryCoverage(
          candidate,
          discoverScheduledAutomations(repoRoot, sources)
        ),
      ];
      return {
        ok: errors.length === 0,
        registry: REGISTRY_PATH,
        baseSha,
        headSha,
        candidateTree,
        registrySha256: createHash('sha256').update(text).digest('hex'),
        errors,
        boundary:
          'Source transition evidence only; no provider inventory, reservation or activation.',
      };
    }
    const text = readFileSync(join(repoRoot, REGISTRY_PATH), 'utf8');
    const registry = parseRegistry(text);
    const proposal = JSON.parse(readFileSync(resolve(args[2]), 'utf8'));
    const errors = checkAutomationProposal(
      registry,
      proposal,
      discoverScheduledAutomations(repoRoot)
    );
    return {
      ok: errors.length === 0,
      registry: REGISTRY_PATH,
      registrySha256: createHash('sha256').update(text).digest('hex'),
      errors,
      boundary:
        'Snapshot preflight only; no reservation or provider creation. Recheck the composed registry through PR/merge and retain incumbent ownership.',
    };
  } catch (error) {
    return {
      ok: false,
      errors: [`unreadable admission evidence: ${error.message}`],
    };
  }
}
