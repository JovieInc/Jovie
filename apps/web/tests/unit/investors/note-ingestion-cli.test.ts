import { spawnSync } from 'node:child_process';
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

const tempDirectories: string[] = [];
const script = 'scripts/ingest-investor-note.ts';
const CLI_TEST_TIMEOUT_MS = 20_000;
const reviewRoot = path.resolve(process.cwd(), '../../.artifacts/fundraising');

function tempDirectory() {
  const directory = mkdtempSync(path.join(tmpdir(), 'investor-note-cli-'));
  tempDirectories.push(directory);
  return directory;
}

function fixture(sourceId = 'conversation-cli') {
  return {
    source: {
      id: sourceId,
      kind: 'local-note',
      label: 'CLI fixture',
      capturedAt: '2026-07-11',
    },
    transcript: 'Synthetic CLI fixture.',
    signals: [
      {
        kind: 'question',
        text: 'What traction is proven?',
        gapClassification: 'evidence',
        severity: 'high',
      },
    ],
  };
}

function run(args: readonly string[]) {
  return spawnSync('pnpm', ['exec', 'tsx', script, ...args], {
    cwd: process.cwd(),
    encoding: 'utf8',
  });
}

afterEach(() => {
  for (const directory of tempDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe('investor note ingestion CLI', () => {
  it(
    'writes JSON exclusively and refuses accidental overwrite',
    () => {
      const directory = tempDirectory();
      const input = path.join(directory, 'note.json');
      const output = path.join(
        reviewRoot,
        `cli-${path.basename(directory)}.json`
      );
      tempDirectories.push(output);
      writeFileSync(input, JSON.stringify(fixture()));

      expect(run([input, `--out=${output}`]).status).toBe(0);
      expect(JSON.parse(readFileSync(output, 'utf8'))).toMatchObject({
        reviewStatus: 'manual-review-required',
      });
      const second = run([input, `--out=${output}`]);
      expect(second.status).not.toBe(0);
      expect(() => JSON.parse(second.stderr)).not.toThrow();
      expect(JSON.parse(second.stderr).error).toMatch(/exist/iu);

      expect(run([input, `--out=${output}`, '--overwrite']).status).toBe(0);
    },
    CLI_TEST_TIMEOUT_MS
  );

  it(
    'refuses input/output collisions even with overwrite enabled',
    () => {
      const directory = tempDirectory();
      const input = path.join(directory, 'note.json');
      writeFileSync(input, JSON.stringify(fixture()));

      const result = run([input, `--out=${input}`, '--overwrite']);
      expect(result.status).not.toBe(0);
      expect(JSON.parse(result.stderr).error).toContain(
        'Output must be inside'
      );
      expect(JSON.parse(readFileSync(input, 'utf8'))).toEqual(fixture());
    },
    CLI_TEST_TIMEOUT_MS
  );

  it(
    'refuses protected source and output paths',
    () => {
      const directory = tempDirectory();
      const protectedInput = path.join(directory, '.env.investor');
      writeFileSync(protectedInput, 'secret=value');
      const protectedOutput = path.join(
        reviewRoot,
        `protected-${path.basename(directory)}.json`
      );
      tempDirectories.push(protectedOutput);
      const inputResult = run([
        protectedInput,
        '--source-id=conversation-protected',
        '--captured-at=2026-07-11',
        `--out=${protectedOutput}`,
      ]);
      expect(inputResult.status).not.toBe(0);
      expect(JSON.parse(inputResult.stderr).error).toContain(
        'Protected path is not allowed'
      );

      const input = path.join(directory, 'note.json');
      writeFileSync(input, JSON.stringify(fixture('conversation-safe')));
      const outputResult = run([
        input,
        `--out=${path.join(directory, 'outside.json')}`,
        '--overwrite',
      ]);
      expect(outputResult.status).not.toBe(0);
      expect(JSON.parse(outputResult.stderr).error).toContain(
        'Output must be inside'
      );
    },
    CLI_TEST_TIMEOUT_MS
  );

  it(
    'accepts arbitrary regular sources but rejects symlink sources and outputs',
    () => {
      const directory = tempDirectory();
      const input = path.join(directory, 'arbitrary.json');
      const linkedInput = path.join(directory, 'linked.json');
      const output = path.join(
        reviewRoot,
        `arbitrary-${path.basename(directory)}.json`
      );
      tempDirectories.push(output);
      writeFileSync(input, JSON.stringify(fixture('conversation-arbitrary')));
      symlinkSync(input, linkedInput);
      expect(run([input, `--out=${output}`]).status).toBe(0);
      const linked = run([linkedInput, `--out=${output}`, '--overwrite']);
      expect(linked.status).not.toBe(0);
      expect(JSON.parse(linked.stderr).error).toContain('Symbolic-link input');

      mkdirSync(reviewRoot, { recursive: true });
      const linkedDirectory = path.join(
        reviewRoot,
        `linked-${path.basename(directory)}`
      );
      tempDirectories.push(linkedDirectory);
      symlinkSync(directory, linkedDirectory);
      const linkedOutput = run([
        input,
        `--out=${path.join(linkedDirectory, 'escaped.json')}`,
      ]);
      expect(linkedOutput.status).not.toBe(0);
      expect(JSON.parse(linkedOutput.stderr).error).toContain(
        'Symbolic-link output path'
      );
    },
    CLI_TEST_TIMEOUT_MS
  );
});
