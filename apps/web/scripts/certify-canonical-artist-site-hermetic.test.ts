import { execFileSync, spawnSync } from 'node:child_process';
import {
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import { certifyCanonicalArtistSite } from './certify-canonical-artist-site';
import {
  cleanupFixtures,
  fixture,
  isolatedGitRoot,
  sourceRevision,
} from './certify-canonical-artist-site.fixtures';

type GitTraceEvent = { event: string; argv?: string[]; worktree?: string };
const temporaryDirectories: string[] = [];

afterEach(() => {
  cleanupFixtures();
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

const git = (cwd: string, args: string[]) =>
  execFileSync('git', args, {
    cwd,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim();

function ambientClone(kind: 'full' | 'partial'): string {
  const directory = mkdtempSync(join(tmpdir(), 'jovie-cert-hermetic-'));
  temporaryDirectories.push(directory);
  const seed = isolatedGitRoot(join(directory, 'seed'));
  git(seed, ['config', 'user.email', 'fixture@example.com']);
  git(seed, ['config', 'user.name', 'Fixture']);
  writeFileSync(join(seed, 'blob.txt'), 'local clone fixture');
  git(seed, ['add', 'blob.txt']);
  git(seed, ['commit', '--quiet', '-m', 'fixture']);
  const origin = join(directory, 'origin.git');
  git(directory, ['clone', '--quiet', '--bare', seed, origin]);
  git(origin, ['config', 'uploadpack.allowFilter', 'true']);
  const clone = join(directory, kind);
  git(directory, [
    'clone',
    '--quiet',
    '--no-checkout',
    ...(kind === 'partial' ? ['--filter=blob:none'] : []),
    pathToFileURL(origin).href,
    clone,
  ]);
  const promisor = spawnSync(
    'git',
    ['config', '--get', 'remote.origin.promisor'],
    { cwd: clone, encoding: 'utf8' }
  ).stdout.trim();
  expect(promisor).toBe(kind === 'partial' ? 'true' : '');
  const objects = git(clone, [
    'rev-list',
    '--objects',
    '--missing=print',
    'HEAD',
  ]);
  expect(/^\?/m.test(objects)).toBe(kind === 'partial');
  return clone;
}

function traced<T>(cwd: string, action: () => T) {
  const trace = join(dirname(cwd), 'git-trace.jsonl');
  writeFileSync(trace, '');
  const previous = {
    cwd: process.cwd(),
    trace: process.env.GIT_TRACE2_EVENT,
    temporary: process.env.TMPDIR,
    temporaryWindows: process.env.TEMP,
    temporaryFallback: process.env.TMP,
  };
  try {
    process.chdir(cwd);
    // Nest fixtures in the ambient clone to catch parent-repository discovery.
    process.env.TMPDIR = cwd;
    process.env.TEMP = cwd;
    process.env.TMP = cwd;
    process.env.GIT_TRACE2_EVENT = trace;
    const result = action();
    const events: GitTraceEvent[] = readFileSync(trace, 'utf8')
      .trim()
      .split('\n')
      .filter(Boolean)
      .map(line => JSON.parse(line));
    return { result, events };
  } finally {
    process.chdir(previous.cwd);
    for (const [key, value] of [
      ['GIT_TRACE2_EVENT', previous.trace],
      ['TMPDIR', previous.temporary],
      ['TEMP', previous.temporaryWindows],
      ['TMP', previous.temporaryFallback],
    ] as const) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

function transportCommands(events: GitTraceEvent[]): string[] {
  return events
    .filter(event => event.event === 'start' || event.event === 'child_start')
    .map(event => event.argv?.join(' ') ?? '')
    .filter(command =>
      /\b(fetch(?:-pack)?|upload-pack|remote-\w+)\b/.test(command)
    );
}

describe('synthetic certification fixtures stay local', () => {
  it.each(['full', 'partial'] as const)(
    'uses its own Git repository inside an ambient %s clone',
    kind => {
      const ambient = ambientClone(kind);
      const { result, events } = traced(ambient, () => {
        const options = fixture();
        const certified = 'a'.repeat(40);
        return {
          gitRoot: options.gitRoot,
          certificate: certifyCanonicalArtistSite({
            ...options,
            sourceRevision: certified,
            sourceHistory: [certified, sourceRevision],
          }),
        };
      });
      expect(result.certificate.status).toBe('GREEN');
      const fixtureRoot = realpathSync(result.gitRoot ?? '');
      expect(dirname(fixtureRoot)).toBe(realpathSync(ambient));
      expect(
        events.flatMap(event =>
          event.event === 'def_repo' && event.worktree
            ? [realpathSync(event.worktree)]
            : []
        )
      ).toContain(fixtureRoot);
      expect(transportCommands(events)).toEqual([]);
    }
  );

  it.each(['full', 'partial'] as const)(
    'preserves quota deferral without fetching in an ambient %s clone',
    kind => {
      const ambient = ambientClone(kind);
      const { result, events } = traced(ambient, () =>
        certifyCanonicalArtistSite({
          ...fixture(),
          sourceRevision: 'a'.repeat(40),
          sourceHistory: [],
          lineageFileEmpty: true,
        })
      );
      expect(result.status).toBe('RED');
      expect(result.safeToSend).toBe(false);
      expect(
        result.checks.some(check =>
          check.detail.startsWith('github-quota-deferred:')
        )
      ).toBe(true);
      expect(transportCommands(events)).toEqual([]);
    }
  );

  it('detects the transport regression when the fixture root is omitted', () => {
    const ambient = ambientClone('partial');
    const { result, events } = traced(ambient, () => {
      const certified = 'a'.repeat(40);
      return certifyCanonicalArtistSite({
        ...fixture(),
        gitRoot: undefined,
        sourceRevision: certified,
        sourceHistory: [certified, sourceRevision],
      });
    });
    expect(result.status).toBe('GREEN');
    // The deliberate regression reaches only the local file:// origin.
    expect(transportCommands(events).join('\n')).toMatch(/\bfetch\b/);
  });
});
