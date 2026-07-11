import { lstat, mkdir, readFile, realpath, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import {
  buildInvestorNoteReviewArtifact,
  inputsFromPriorArtifact,
  investorNoteInputSchema,
  parseAnnotatedTranscript,
} from '@/lib/investors/note-ingestion';

interface CliOptions {
  readonly inputs: readonly string[];
  readonly output: string | null;
  readonly capturedAt: string | null;
  readonly sourceId: string | null;
  readonly overwrite: boolean;
  readonly prior: string | null;
}

const webRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..'
);
const repoRoot = path.resolve(webRoot, '../..');
export const reviewArtifactRoot = path.join(repoRoot, '.artifacts/fundraising');

function parseArgs(argv: readonly string[]): CliOptions {
  const inputs: string[] = [];
  let output: string | null = null;
  let capturedAt: string | null = null;
  let sourceId: string | null = null;
  let overwrite = false;
  let prior: string | null = null;
  for (const arg of argv) {
    if (arg.startsWith('--out=')) output = arg.slice('--out='.length);
    else if (arg.startsWith('--captured-at='))
      capturedAt = arg.slice('--captured-at='.length);
    else if (arg.startsWith('--source-id='))
      sourceId = arg.slice('--source-id='.length);
    else if (arg === '--overwrite') overwrite = true;
    else if (arg.startsWith('--prior=')) prior = arg.slice('--prior='.length);
    else inputs.push(arg);
  }
  if (inputs.length === 0) {
    throw new Error(
      'Usage: pnpm --filter @jovie/web exec tsx scripts/ingest-investor-note.ts <note.json|note.txt> [more JSON files] [--prior=prior-artifact.json] [--source-id=stable-id] [--captured-at=YYYY-MM-DD] --out=.artifacts/fundraising/artifact.json [--overwrite]'
    );
  }
  if (!output) throw new Error('--out is required.');
  return { inputs, output, capturedAt, sourceId, overwrite, prior };
}

async function resolveSafeInputPath(filePath: string): Promise<string> {
  const resolved = path.resolve(filePath);
  const basename = path.basename(resolved).toLocaleLowerCase('en-US');
  const canonicalRegistry = path.resolve(
    webRoot,
    'lib/investors/fundraising-registry.ts'
  );
  if (
    resolved.split(path.sep).includes('.git') ||
    resolved.split(path.sep).includes('node_modules') ||
    basename.startsWith('.env') ||
    basename === '.npmrc' ||
    resolved === canonicalRegistry
  ) {
    throw new Error(`Protected path is not allowed: ${filePath}`);
  }
  const stats = await lstat(resolved);
  if (stats.isSymbolicLink()) {
    throw new Error(`Symbolic-link input is not allowed: ${filePath}`);
  }
  return realpath(resolved);
}

function isInside(root: string, candidate: string): boolean {
  const relative = path.relative(root, candidate);
  return (
    relative !== '' &&
    !relative.startsWith(`..${path.sep}`) &&
    relative !== '..' &&
    !path.isAbsolute(relative)
  );
}

async function resolveSafeOutputPath(filePath: string): Promise<string> {
  const resolved = path.resolve(filePath);
  if (path.extname(resolved).toLocaleLowerCase('en-US') !== '.json') {
    throw new Error('Review artifact output must use a .json extension.');
  }
  if (!isInside(reviewArtifactRoot, resolved)) {
    throw new Error(`Output must be inside ${reviewArtifactRoot}.`);
  }
  await mkdir(reviewArtifactRoot, { recursive: true });
  if ((await lstat(reviewArtifactRoot)).isSymbolicLink()) {
    throw new Error(
      `Symbolic-link artifact root is not allowed: ${reviewArtifactRoot}`
    );
  }
  const realRoot = await realpath(reviewArtifactRoot);
  if (realRoot !== reviewArtifactRoot) {
    throw new Error(
      `Artifact root resolves through a symbolic link: ${reviewArtifactRoot}`
    );
  }
  let cursor = path.dirname(resolved);
  while (isInside(reviewArtifactRoot, cursor)) {
    try {
      const stats = await lstat(cursor);
      if (stats.isSymbolicLink()) {
        throw new Error(
          `Symbolic-link output path is not allowed: ${filePath}`
        );
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    }
    cursor = path.dirname(cursor);
  }
  const parent = path.dirname(resolved);
  await mkdir(parent, { recursive: true });
  const realParent = await realpath(parent);
  if (!isInside(realRoot, realParent) && realParent !== realRoot) {
    throw new Error(`Output resolves outside ${reviewArtifactRoot}.`);
  }
  try {
    const outputStats = await lstat(resolved);
    if (outputStats.isSymbolicLink()) {
      throw new Error(`Symbolic-link output is not allowed: ${filePath}`);
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
  }
  return resolved;
}

async function readInput(
  filePath: string,
  options: Pick<CliOptions, 'capturedAt' | 'sourceId'>
) {
  const safePath = await resolveSafeInputPath(filePath);
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
  const inputPaths = await Promise.all(
    options.inputs.map(resolveSafeInputPath)
  );
  if (new Set(inputPaths).size !== inputPaths.length) {
    throw new Error('The same input path cannot be supplied more than once.');
  }
  const outputPath = await resolveSafeOutputPath(options.output!);
  const priorPath = options.prior
    ? await resolveSafeInputPath(options.prior)
    : null;
  if (inputPaths.includes(outputPath) || priorPath === outputPath) {
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
  const priorInputs = options.prior
    ? inputsFromPriorArtifact(JSON.parse(await readFile(priorPath!, 'utf8')))
    : [];
  const serialized = `${JSON.stringify(
    buildInvestorNoteReviewArtifact([...priorInputs, ...inputs]),
    null,
    2
  )}\n`;
  await writeFile(outputPath, serialized, {
    encoding: 'utf8',
    flag: options.overwrite ? 'w' : 'wx',
  });
  process.stdout.write(`${JSON.stringify({ output: outputPath })}\n`);
}

main().catch(error => {
  process.stderr.write(
    `${JSON.stringify({
      error: error instanceof Error ? error.message : String(error),
    })}\n`
  );
  process.exitCode = 1;
});
