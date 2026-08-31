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

function runGit(args: string[], input?: string): string {
  gitCommandCount += 1;
  return execFileSync('git', args, {
    cwd: repoRoot,
    encoding: 'utf8',
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

function receiptIssues(
  receipts: StoryReceipt[],
  objects: ReadonlyMap<string, string | null>,
  ancestorObjectNames: ReadonlySet<string>,
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
    if (!objects.get(`${sourceSha}:${storyPath}`)) {
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
      [`${missingPathSha}:moved.stories.tsx`, null],
      [`${validSha}^{commit}`, validObjectName],
      [`${validSha}:valid.stories.tsx`, 'd'.repeat(40)],
    ]);

    expect(
      receiptIssues(
        receipts,
        objects,
        new Set([missingPathObjectName, validObjectName]),
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
        true
      )
    ).toEqual([
      `branch.stories.tsx: non-ancestral sourceSha ${nonAncestralSha}`,
      'moved.stories.tsx: sourceSha cannot replay its story path',
    ]);
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
      ...receipts.map(
        ({ sourceSha, storyPath }) => `${sourceSha}:${storyPath}`
      ),
    ]);
    const ancestorObjectNames = new Set(
      runGit(['rev-list', 'HEAD']).trim().split('\n')
    );
    const issues = receiptIssues(
      receipts,
      objects,
      ancestorObjectNames,
      shallow
    );

    expect(issues, issues.join('\n')).toEqual([]);
    expect(receipts.length).toBeGreaterThan(0);
    expect(gitCommandCount - commandsBefore).toBe(3);
  });
});
