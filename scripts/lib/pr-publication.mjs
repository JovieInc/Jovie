/** Publication implementation for the gate-checked pr:open wrapper only. */
import {
  appendFileSync,
  closeSync,
  fsyncSync,
  mkdirSync,
  mkdtempSync,
  openSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import path from 'node:path';
import { renderCapabilityRequest } from './capability-request.mjs';
import { publicationCapabilityRequest } from './job-capability-observation.mjs';

/** Strict capability persistence in the existing publication journal; metrics remain best effort. */
export function persistPublicationCapabilityRequest(
  request,
  journal = path.join(homedir(), '.local/state/jovie-lanes/pr-open.jsonl')
) {
  const read = () => {
    try {
      const content = readFileSync(journal, 'utf8');
      if (content.length > 8 * 1024 * 1024)
        throw new Error('capability-journal-too-large');
      return content
        .split('\n')
        .filter(Boolean)
        .map(line => JSON.parse(line));
    } catch (error) {
      if (error.code === 'ENOENT') return [];
      throw error;
    }
  };
  const prior = read()
    .reverse()
    .find(row => row.capabilityRequest?.id === request.id)?.capabilityRequest;
  const next = prior
    ? {
        ...prior,
        ...(request.execution?.outcome === 'unknown'
          ? { execution: request.execution }
          : {}),
      }
    : request;
  if (prior && JSON.stringify(next) === JSON.stringify(prior))
    return { persisted: true, request: prior };
  mkdirSync(path.dirname(journal), { recursive: true });
  const descriptor = openSync(journal, 'a', 0o600);
  try {
    appendFileSync(
      descriptor,
      `${JSON.stringify({ at: request.createdAt, capabilityRequest: next })}\n`
    );
    fsyncSync(descriptor);
  } finally {
    closeSync(descriptor);
  }
  const stored = read()
    .reverse()
    .find(row => row.capabilityRequest?.id === request.id)?.capabilityRequest;
  if (!stored) throw new Error('capability-journal-readback-missing');
  return { persisted: true, request: stored };
}

export async function publishQualifiedPr({
  a,
  body,
  title,
  labels,
  git,
  github,
  log,
  diagnose,
  recordCapability,
  now,
  repository,
  placeholder,
}) {
  const dir = mkdtempSync(path.join(tmpdir(), 'pr-open-create-'));
  try {
    const bodyFile = path.join(dir, 'body.md');
    writeFileSync(bodyFile, body);
    const branchResult = git(['branch', '--show-current']);
    const branch = branchResult.stdout.trim();
    const local = git(['rev-parse', 'HEAD']);
    const expectedHead = local.stdout.trim();
    if (
      branchResult.status !== 0 ||
      !branch ||
      local.status !== 0 ||
      !/^[0-9a-f]{40}$/.test(expectedHead)
    )
      throw new Error(
        'publication-head: cannot resolve the intended branch and commit'
      );
    const unavailable = (result, phase = 'preflight') => {
      const request = publicationCapabilityRequest({
        head: expectedHead,
        branch,
        result,
        nowMs: now(),
      });
      if (!request) {
        diagnose(
          'Publication failed without attributable capability evidence; reconcile the exact-head PR before retrying any uncertain mutation.'
        );
        return result.status ?? 1;
      }
      request.execution = {
        outcome: phase === 'mutation' ? 'unknown' : 'not-started',
        nextAction:
          phase === 'mutation'
            ? 'read-existing-pr-for-exact-head-before-resume'
            : 'resolve-required-capability',
      };
      try {
        const persisted = recordCapability(request);
        if (persisted?.persisted !== true)
          throw new Error('capability-journal-unverified');
        diagnose(renderCapabilityRequest(persisted.request ?? request));
      } catch {
        diagnose(renderCapabilityRequest(request));
        diagnose(
          'Capability request persistence failed; delivery remains unverified. Preserve this report and restore the existing journal before resuming.'
        );
        return 1;
      }
      // Journal/console output is pending delivery, never a user approval receipt.
      return 75;
    };
    const probeCapability = () =>
      github(a.repo, [
        'api',
        'graphql',
        '-f',
        'query=query { viewer { login } }',
      ]);
    if (!a.noPush) {
      const capability = probeCapability();
      if (capability.status !== 0) return unavailable(capability);
      const push = git(['push', '-u', 'origin', 'HEAD'], {
        stdio: 'inherit',
      });
      if (push.status !== 0) return push.status ?? 1;
    }
    // A narrow origin.fetch may not map this branch to @{upstream}: prove the
    // remote head and name it; never re-push or bypass publication gates.
    const remoteRef = `refs/heads/${branch}`;
    const published = git(
      ['ls-remote', '--exit-code', '--heads', 'origin', remoteRef],
      { timeout: 30_000 }
    );
    if (published.status !== 0)
      throw new Error(
        `publication-head: remote head unavailable for ${branch}`
      );
    const refs = published.stdout
      .trim()
      .split(/\r?\n/)
      .map(line => line.trim().split(/\s+/));
    if (
      refs.length !== 1 ||
      refs[0][0] !== expectedHead ||
      refs[0][1] !== remoteRef
    )
      throw new Error(
        `publication-head: remote head does not match the intended commit for ${branch}`
      );
    if (a.noPush) {
      const capability = probeCapability();
      if (capability.status !== 0) return unavailable(capability);
    }
    const made = github(a.repo, [
      'pr',
      'create',
      '--head',
      branch,
      '--repo',
      repository,
      '--base',
      a.base,
      '--title',
      title,
      '--body-file',
      bodyFile,
      ...(a.draft ? ['--draft'] : []),
      ...labels.flatMap(l => ['--label', l]),
    ]);
    if (made.status !== 0) {
      unavailable(made, 'mutation');
      return made.status ?? 1;
    }
    log((made.stdout || made.stderr).trim());
    const url = made.stdout.trim().split('\n').pop();
    if (made.status === 0 && body.includes(placeholder)) {
      writeFileSync(bodyFile, body.replaceAll(placeholder, url));
      const edited = github(a.repo, [
        'pr',
        'edit',
        url,
        '--repo',
        repository,
        '--body-file',
        bodyFile,
      ]);
      if (edited.status !== 0) return edited.status ?? 1;
    }
    return made.status ?? 1;
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}
