import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import {
  buildInvestorNoteReviewArtifact,
  investorNoteInputSchema,
  parseAnnotatedTranscript,
} from '@/lib/investors/note-ingestion';

interface CliOptions {
  readonly inputs: readonly string[];
  readonly output: string | null;
  readonly capturedAt: string | null;
  readonly sourceId: string | null;
  readonly overwrite: boolean;
}

const webRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..'
);

function parseArgs(argv: readonly string[]): CliOptions {
  const inputs: string[] = [];
  let output: string | null = null;
  let capturedAt: string | null = null;
  let sourceId: string | null = null;
  let overwrite = false;
  for (const arg of argv) {
    if (arg.startsWith('--out=')) output = arg.slice('--out='.length);
    else if (arg.startsWith('--captured-at='))
      capturedAt = arg.slice('--captured-at='.length);
    else if (arg.startsWith('--source-id='))
      sourceId = arg.slice('--source-id='.length);
    else if (arg === '--overwrite') overwrite = true;
    else inputs.push(arg);
  }
  if (inputs.length === 0) {
    throw new Error(
      'Usage: pnpm --filter @jovie/web exec tsx scripts/ingest-investor-note.ts <note.json|note.txt> [more JSON files] [--source-id=stable-id] [--captured-at=YYYY-MM-DD] [--out=artifact.json] [--overwrite]'
    );
  }
  return { inputs, output, capturedAt, sourceId, overwrite };
}

function resolveSafePath(filePath: string): string {
  const resolved = path.resolve(filePath);
  const segments = resolved.split(path.sep);
  const basename = path.basename(resolved).toLocaleLowerCase('en-US');
  const canonicalRegistry = path.resolve(
    webRoot,
    'lib/investors/fundraising-registry.ts'
  );
  if (
    segments.includes('.git') ||
    segments.includes('node_modules') ||
    basename.startsWith('.env') ||
    basename === '.npmrc' ||
    resolved === canonicalRegistry
  ) {
    throw new Error(`Protected path is not allowed: ${filePath}`);
  }
  return resolved;
}

async function readInput(
  filePath: string,
  options: Pick<CliOptions, 'capturedAt' | 'sourceId'>
) {
  const safePath = resolveSafePath(filePath);
  const raw = await readFile(safePath, 'utf8');
  if (path.extname(safePath).toLocaleLowerCase('en-US') === '.json') {
    return investorNoteInputSchema.parse(JSON.parse(raw));
  }
  if (!options.capturedAt || !options.sourceId) {
    throw new Error(
      `--captured-at and --source-id are required for plain text input ${filePath}`
    );
  }
  return investorNoteInputSchema.parse({
    source: {
      id: options.sourceId,
      kind: 'local-note',
      label: path.basename(safePath),
      capturedAt: options.capturedAt,
    },
    transcript: raw,
    signals: parseAnnotatedTranscript(raw),
  });
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const inputPaths = options.inputs.map(resolveSafePath);
  if (new Set(inputPaths).size !== inputPaths.length) {
    throw new Error('The same input path cannot be supplied more than once.');
  }
  const outputPath = options.output ? resolveSafePath(options.output) : null;
  if (outputPath && inputPaths.includes(outputPath)) {
    throw new Error('Output path must not equal an input path.');
  }
  if (
    inputPaths.some(
      file => path.extname(file).toLocaleLowerCase('en-US') !== '.json'
    ) &&
    inputPaths.length > 1
  ) {
    throw new Error('Plain text ingestion accepts exactly one input per run.');
  }

  const inputs = await Promise.all(
    inputPaths.map(input => readInput(input, options))
  );
  const serialized = `${JSON.stringify(
    buildInvestorNoteReviewArtifact(inputs),
    null,
    2
  )}\n`;
  if (outputPath) {
    await writeFile(outputPath, serialized, {
      encoding: 'utf8',
      flag: options.overwrite ? 'w' : 'wx',
    });
  } else {
    process.stdout.write(serialized);
  }
}

main().catch(error => {
  process.stderr.write(
    `${JSON.stringify({
      error: error instanceof Error ? error.message : String(error),
    })}\n`
  );
  process.exitCode = 1;
});
