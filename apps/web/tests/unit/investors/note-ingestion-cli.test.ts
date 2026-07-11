import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

const tempDirectories: string[] = [];
const script = 'scripts/ingest-investor-note.ts';
const CLI_TEST_TIMEOUT_MS = 20_000;

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
      const output = path.join(directory, 'artifact.json');
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
        'Output path must not equal an input path.'
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
      const inputResult = run([
        protectedInput,
        '--source-id=conversation-protected',
        '--captured-at=2026-07-11',
      ]);
      expect(inputResult.status).not.toBe(0);
      expect(JSON.parse(inputResult.stderr).error).toContain(
        'Protected path is not allowed'
      );

      const input = path.join(directory, 'note.json');
      writeFileSync(input, JSON.stringify(fixture('conversation-safe')));
      const outputResult = run([
        input,
        `--out=${path.join(directory, '.env.output')}`,
        '--overwrite',
      ]);
      expect(outputResult.status).not.toBe(0);
      expect(JSON.parse(outputResult.stderr).error).toContain(
        'Protected path is not allowed'
      );
    },
    CLI_TEST_TIMEOUT_MS
  );
});
