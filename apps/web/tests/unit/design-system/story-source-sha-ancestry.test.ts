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

describe('story receipt SHA ancestry', () => {
  it('keeps every literal receipt ancestral and able to replay its story path', () => {
    const issues: string[] = [];
    const shallow =
      execFileSync('git', ['rev-parse', '--is-shallow-repository'], {
        cwd: repoRoot,
        encoding: 'utf8',
      }).trim() === 'true';

    for (const file of listStoryFiles(componentsRoot)) {
      const storyPath = relative(repoRoot, file).split(sep).join('/');
      for (const sourceSha of sourceShas(readFileSync(file, 'utf8'))) {
        try {
          execFileSync('git', ['cat-file', '-e', `${sourceSha}^{commit}`], {
            cwd: repoRoot,
            stdio: 'pipe',
          });
        } catch {
          if (!shallow) {
            issues.push(`${storyPath}: missing commit ${sourceSha}`);
          }
          continue;
        }

        try {
          execFileSync(
            'git',
            ['merge-base', '--is-ancestor', sourceSha, 'HEAD'],
            { cwd: repoRoot, stdio: 'pipe' }
          );
        } catch {
          issues.push(`${storyPath}: non-ancestral sourceSha ${sourceSha}`);
          continue;
        }

        try {
          execFileSync('git', ['cat-file', '-e', `${sourceSha}:${storyPath}`], {
            cwd: repoRoot,
            stdio: 'pipe',
          });
        } catch {
          issues.push(`${storyPath}: sourceSha cannot replay its story path`);
        }
      }
    }

    expect(issues, issues.join('\n')).toEqual([]);
  });
});
