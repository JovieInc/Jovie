import { randomUUID } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import {
  buildJudgePrompt,
  type JudgeTransport,
} from '../../packages/copy/judge.ts';
import { routedTransport } from '../../packages/copy/transport.ts';
import {
  generateProject,
  readHistory,
  renderProject,
  saveRevision,
  setLock,
} from './project.mts';

const root = fileURLToPath(new URL('../../', import.meta.url));
const usage = `Content OS P0 (repo-local; uses the authenticated Codex subscription CLI)
  pnpm jovie script "<idea>" [--output <directory>] [--model openai/<model>]
  pnpm jovie script --input <transcript.txt> [--output <directory>]
  pnpm jovie script show <directory> [--json]
  pnpm jovie script lock <directory> <B-number>
  pnpm jovie script unlock <directory> <B-number>
  pnpm jovie script regenerate <directory> --feedback "<revision request>"
Each change appends an immutable revision to <directory>/project.jsonl.
show renders the full cited package; --json includes inspectable lock state.`;

export async function runContentCli(
  argv: string[],
  dependencies: {
    send?: JudgeTransport;
    stdout?: (text: string) => void;
    stderr?: (text: string) => void;
  } = {}
): Promise<number> {
  const out =
    dependencies.stdout ??
    (text => process.stdout.write(text.endsWith('\n') ? text : `${text}\n`));
  const err =
    dependencies.stderr ?? (text => process.stderr.write(`${text}\n`));
  try {
    const { values, positionals } = parseArgs({
      args: argv,
      allowPositionals: true,
      options: {
        feedback: { type: 'string' },
        help: { type: 'boolean', short: 'h' },
        input: { type: 'string' },
        json: { type: 'boolean' },
        model: { type: 'string' },
        output: { type: 'string' },
      },
    });
    if (values.help || argv.length === 0) {
      out(usage);
      return 0;
    }
    if (positionals[0] !== 'script')
      throw new Error('Expected script command.');
    const action = positionals[1];
    const editing = ['lock', 'unlock', 'regenerate', 'show'].includes(
      action ?? ''
    );
    if (editing && (values.input || values.output))
      throw new Error(
        'Editing uses the existing project directory; --input/--output are generation-only.'
      );
    if (action !== 'regenerate' && values.feedback)
      throw new Error('--feedback requires regenerate.');
    if (editing && action !== 'regenerate' && values.model)
      throw new Error('--model requires generation or regeneration.');
    const previous = editing
      ? readHistory(resolve(positionals[2] ?? '')).at(-1)
      : undefined;
    if (editing && (!positionals[2] || !previous))
      throw new Error('Provide an existing project directory.');
    const expected =
      action === 'lock' || action === 'unlock'
        ? 4
        : editing
          ? 3
          : values.input
            ? 1
            : 2;
    if (positionals.length !== expected || (values.input && action))
      throw new Error(
        'Incorrect arguments. Quote ideas and feedback that contain spaces.'
      );
    const dir = resolve(
      editing
        ? positionals[2]
        : (values.output ?? `content-projects/${randomUUID()}`)
    );
    if (!editing && existsSync(join(dir, 'project.jsonl')))
      throw new Error('Project already exists. Use script regenerate.');
    if (action === 'show' && previous) {
      out(values.json ? JSON.stringify(previous) : renderProject(previous));
      return 0;
    }
    if ((action === 'lock' || action === 'unlock') && previous) {
      const project = setLock(previous, positionals[3], action === 'lock');
      saveRevision(dir, project);
      out(
        values.json
          ? JSON.stringify(project)
          : `Revision ${project.revision}: ${project.event}. ${dir}/project.jsonl`
      );
      return 0;
    }
    const rawInput =
      previous?.rawInput ??
      (values.input
        ? readFileSync(resolve(values.input), 'utf8')
        : (action ?? ''));
    if (!rawInput.trim() || Buffer.byteLength(rawInput) > 100_000)
      throw new Error('Input must contain 1 to 100000 bytes of text.');
    const model = values.model ?? previous?.model ?? 'openai/default';
    if (
      !model?.startsWith('openai/') ||
      !/^openai\/[a-zA-Z0-9.-]+$/.test(model)
    )
      throw new Error(
        'Choose an openai/<model> subscription model for live research.'
      );
    const voice =
      buildJudgePrompt('', {
        register: 'founder-tim',
        tier: 'standard',
        audience: 'Tim White vlog viewers',
        goal: 'Explore a question through evidence',
        facts: [],
      }).prompt + readFileSync(resolve(root, 'canon/VOICE.md'), 'utf8');
    const project = await generateProject({
      rawInput,
      model,
      previous,
      canon:
        previous?.canon ??
        JSON.parse(
          readFileSync(resolve(root, 'canon/content-os.json'), 'utf8')
        ),
      voice,
      feedback: values.feedback,
      send: dependencies.send ?? routedTransport(),
      onStage: stage => err(`Content OS: ${stage}`),
    });
    saveRevision(dir, project);
    out(
      values.json
        ? JSON.stringify({ directory: dir, project })
        : `${renderProject(project)}\nSaved: ${dir}/project.jsonl`
    );
    return 0;
  } catch (error) {
    err(
      `Content OS: ${error instanceof Error ? error.message : String(error)}`
    );
    return 1;
  }
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
)
  process.exitCode = await runContentCli(process.argv.slice(2));
