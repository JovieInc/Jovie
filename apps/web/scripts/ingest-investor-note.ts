import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import {
  buildInvestorNoteReviewArtifact,
  investorNoteInputSchema,
  parseAnnotatedTranscript,
} from '@/lib/investors/note-ingestion';

interface CliOptions {
  readonly inputs: readonly string[];
  readonly output: string | null;
  readonly capturedAt: string | null;
}

function parseArgs(argv: readonly string[]): CliOptions {
  const inputs: string[] = [];
  let output: string | null = null;
  let capturedAt: string | null = null;
  for (const arg of argv) {
    if (arg.startsWith('--out=')) output = arg.slice('--out='.length);
    else if (arg.startsWith('--captured-at='))
      capturedAt = arg.slice('--captured-at='.length);
    else inputs.push(arg);
  }
  if (inputs.length === 0) {
    throw new Error(
      'Usage: pnpm --filter @jovie/web exec tsx scripts/ingest-investor-note.ts <note.json|note.txt> [more files] [--captured-at=YYYY-MM-DD] [--out=artifact.json]'
    );
  }
  return { inputs, output, capturedAt };
}

async function readInput(filePath: string, capturedAt: string | null) {
  const raw = await readFile(filePath, 'utf8');
  if (path.extname(filePath).toLocaleLowerCase('en-US') === '.json') {
    return investorNoteInputSchema.parse(JSON.parse(raw));
  }
  if (!capturedAt) {
    throw new Error(`--captured-at=YYYY-MM-DD is required for ${filePath}`);
  }
  return investorNoteInputSchema.parse({
    source: {
      kind: 'local-note',
      label: path.basename(filePath),
      capturedAt,
    },
    transcript: raw,
    signals: parseAnnotatedTranscript(raw),
  });
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const inputs = await Promise.all(
    options.inputs.map(input => readInput(input, options.capturedAt))
  );
  const artifact = buildInvestorNoteReviewArtifact(inputs);
  const serialized = `${JSON.stringify(artifact, null, 2)}\n`;
  if (options.output) {
    await writeFile(options.output, serialized, 'utf8');
  } else {
    process.stdout.write(serialized);
  }
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
