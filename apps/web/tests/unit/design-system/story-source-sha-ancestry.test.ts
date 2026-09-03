import { execFileSync } from 'node:child_process';
import { readdirSync, readFileSync } from 'node:fs';
import { relative, resolve, sep } from 'node:path';
import { describe, expect, it } from 'vitest';

const repoRoot = resolve(process.cwd(), '../..');
const componentsRoot = resolve(process.cwd(), 'components');
const directReceiptShaPattern =
  /(?:sourceSha|containingMergeSha):\s*'([0-9a-f]{40})'/g;
const constantSourceShaPattern =
  /const\s+[A-Z0-9_]*SOURCE_SHA[A-Z0-9_]*\s*=\s*'([0-9a-f]{40})'/g;

function listStoryFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) {
      return listStoryFiles(path);
    }
    return entry.isFile() && entry.name.endsWith('.stories.tsx') ? [path] : [];
  });
}

function sourceShas(source: string): string[] {
  return [directReceiptShaPattern, constantSourceShaPattern].flatMap(pattern =>
    Array.from(source.matchAll(pattern), match => match[1])
  );
}

interface StoryReceipt {
  readonly sourceSha: string;
  readonly storyPath: string;
}

let gitCommandCount = 0;

interface GitEnvironment {
  readonly GIT_NO_LAZY_FETCH?: string;
}

type GitRunner = (
  args: string[],
  input?: string,
  environment?: GitEnvironment
) => string;

function runGit(
  args: string[],
  input?: string,
  environment?: GitEnvironment
): string {
  gitCommandCount += 1;
  return execFileSync('git', args, {
    cwd: repoRoot,
    encoding: 'utf8',
    env: { ...process.env, ...environment },
    input,
    maxBuffer: 10 * 1024 * 1024,
    stdio: ['pipe', 'pipe', 'pipe'],
  });
}

function storyReceipts(): StoryReceipt[] {
  return listStoryFiles(componentsRoot).flatMap(file => {
    const storyPath = relative(repoRoot, file).split(sep).join('/');
    return sourceShas(readFileSync(file, 'utf8')).map(sourceSha => ({
      sourceSha,
      storyPath,
    }));
  });
}

function batchObjects(expressions: string[]): Map<string, string | null> {
  const uniqueExpressions = Array.from(new Set(expressions));
  if (uniqueExpressions.length === 0) return new Map();

  const output = runGit(
    ['cat-file', '--batch-check=%(objectname) %(objecttype)'],
    `${uniqueExpressions.join('\n')}\n`
  );
  const lines = output.trimEnd().split('\n');
  if (lines.length !== uniqueExpressions.length) {
    throw new Error(
      `git cat-file returned ${lines.length} results for ${uniqueExpressions.length} expressions`
    );
  }

  return new Map(
    uniqueExpressions.map((expression, index) => {
      const line = lines[index];
      if (line?.endsWith(' missing')) return [expression, null];
      const object = line?.match(/^([0-9a-f]{40}) (?:blob|commit|tag|tree)$/);
      if (object?.[1]) {
        return [expression, object[1]];
      }
      throw new Error(`Unexpected git cat-file result: ${line ?? '(none)'}`);
    })
  );
}

function replayableStoryPaths(
  receipts: StoryReceipt[],
  objects: ReadonlyMap<string, string | null>,
  git: GitRunner = runGit
): Set<string> {
  const receiptsBySourceSha = new Map<string, Set<string>>();
  for (const { sourceSha, storyPath } of receipts) {
    if (!objects.get(`${sourceSha}^{commit}`)) continue;
    const storyPaths = receiptsBySourceSha.get(sourceSha) ?? new Set<string>();
    storyPaths.add(storyPath);
    receiptsBySourceSha.set(sourceSha, storyPaths);
  }

  const replayable = new Set<string>();
  for (const [sourceSha, storyPaths] of receiptsBySourceSha) {
    const commitObjectName = objects.get(`${sourceSha}^{commit}`);
    if (!commitObjectName) continue;
    const paths = Array.from(storyPaths);
    const output = git(
      ['ls-tree', '-r', '-z', '--name-only', commitObjectName, '--', ...paths],
      undefined,
      { GIT_NO_LAZY_FETCH: '1' }
    );
    for (const storyPath of output.split('\0')) {
      if (storyPath) replayable.add(`${sourceSha}:${storyPath}`);
    }
  }

  return replayable;
}

function receiptIssues(
  receipts: StoryReceipt[],
  objects: ReadonlyMap<string, string | null>,
  ancestorObjectNames: ReadonlySet<string>,
  replayablePaths: ReadonlySet<string>,
  shallow: boolean
): string[] {
  const issues: string[] = [];
  for (const { sourceSha, storyPath } of receipts) {
    const commitObjectName = objects.get(`${sourceSha}^{commit}`);
    if (!commitObjectName) {
      if (!shallow) {
        issues.push(`${storyPath}: missing commit ${sourceSha}`);
      }
      continue;
    }
    if (!ancestorObjectNames.has(commitObjectName)) {
      issues.push(`${storyPath}: non-ancestral sourceSha ${sourceSha}`);
      continue;
    }
    if (!replayablePaths.has(`${sourceSha}:${storyPath}`)) {
      issues.push(`${storyPath}: sourceSha cannot replay its story path`);
    }
  }
  return issues;
}

describe('story receipt SHA ancestry', () => {
  it('batches present and missing object checks without losing either result', () => {
    const headExpression = 'HEAD^{commit}';
    const missingExpression = `${'0'.repeat(40)}^{commit}`;
    const objects = batchObjects([
      headExpression,
      missingExpression,
      headExpression,
    ]);

    expect(objects).toHaveLength(2);
    expect(objects.get(headExpression)).toMatch(/^[0-9a-f]{40}$/);
    expect(objects.get(missingExpression)).toBeNull();
  });

  it('preserves missing, non-ancestral, and replay-path diagnostics', () => {
    const missingSha = '1'.repeat(40);
    const nonAncestralSha = '2'.repeat(40);
    const missingPathSha = '3'.repeat(40);
    const validSha = '4'.repeat(40);
    const receipts = [
      { sourceSha: missingSha, storyPath: 'missing.stories.tsx' },
      { sourceSha: nonAncestralSha, storyPath: 'branch.stories.tsx' },
      { sourceSha: missingPathSha, storyPath: 'moved.stories.tsx' },
      { sourceSha: validSha, storyPath: 'valid.stories.tsx' },
    ];
    const nonAncestralObjectName = 'a'.repeat(40);
    const missingPathObjectName = 'b'.repeat(40);
    const validObjectName = 'c'.repeat(40);
    const objects = new Map<string, string | null>([
      [`${missingSha}^{commit}`, null],
      [`${nonAncestralSha}^{commit}`, nonAncestralObjectName],
      [`${missingPathSha}^{commit}`, missingPathObjectName],
      [`${validSha}^{commit}`, validObjectName],
    ]);
    const replayablePaths = new Set([`${validSha}:valid.stories.tsx`]);

    expect(
      receiptIssues(
        receipts,
        objects,
        new Set([missingPathObjectName, validObjectName]),
        replayablePaths,
        false
      )
    ).toEqual([
      `missing.stories.tsx: missing commit ${missingSha}`,
      `branch.stories.tsx: non-ancestral sourceSha ${nonAncestralSha}`,
      'moved.stories.tsx: sourceSha cannot replay its story path',
    ]);
    expect(
      receiptIssues(
        receipts,
        objects,
        new Set([missingPathObjectName, validObjectName]),
        replayablePaths,
        true
      )
    ).toEqual([
      `branch.stories.tsx: non-ancestral sourceSha ${nonAncestralSha}`,
      'moved.stories.tsx: sourceSha cannot replay its story path',
    ]);
  });

  it('checks replay paths from trees without fetching historical blobs', () => {
    const sourceSha = '1'.repeat(40);
    const commitObjectName = '2'.repeat(40);
    const receipts = [
      { sourceSha, storyPath: 'present.stories.tsx' },
      { sourceSha, storyPath: 'missing.stories.tsx' },
    ];
    const objects = new Map<string, string | null>([
      [`${sourceSha}^{commit}`, commitObjectName],
    ]);
    const git: GitRunner = (args, input, environment) => {
      expect(args).toEqual([
        'ls-tree',
        '-r',
        '-z',
        '--name-only',
        commitObjectName,
        '--',
        'present.stories.tsx',
        'missing.stories.tsx',
      ]);
      expect(input).toBeUndefined();
      expect(environment).toEqual({ GIT_NO_LAZY_FETCH: '1' });
      return 'present.stories.tsx\0';
    };

    expect(replayableStoryPaths(receipts, objects, git)).toEqual(
      new Set([`${sourceSha}:present.stories.tsx`])
    );
  });

  it('keeps every literal receipt ancestral and able to replay its story path', () => {
    const commandsBefore = gitCommandCount;
    const shallow =
      runGit(['rev-parse', '--is-shallow-repository']).trim() === 'true';

    const receipts = storyReceipts();
    const receiptShas = Array.from(
      new Set(receipts.map(receipt => receipt.sourceSha))
    );
    const objects = batchObjects([
      ...receiptShas.map(sourceSha => `${sourceSha}^{commit}`),
    ]);
    const ancestorObjectNames = new Set(
      runGit(['rev-list', 'HEAD']).trim().split('\n')
    );
    const replayablePaths = replayableStoryPaths(receipts, objects);
    const issues = receiptIssues(
      receipts,
      objects,
      ancestorObjectNames,
      replayablePaths,
      shallow
    );

    expect(issues, issues.join('\n')).toEqual([]);
    expect(receipts.length).toBeGreaterThan(0);
    expect(gitCommandCount - commandsBefore).toBe(3 + receiptShas.length);
  });
});
