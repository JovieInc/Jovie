/**
 * Image generation through the local Codex CLI on the ChatGPT subscription
 * (JOV-7765). Codex's built-in `image_gen` tool needs no API key; this
 * adapter never reads one and strips OPENAI_API_KEY from the child env so
 * the imagegen skill cannot fall back to its API-key CLI path.
 *
 * Fails closed: an unauthenticated CLI, an API-key login, a missing binary,
 * the per-run cap or a run that saves no image all return a non-success.
 * Codex saves each image under $CODEX_HOME/generated_images/<thread_id>/.
 */

import { spawn, spawnSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import type {
  ImageGenerationAdapter,
  ImageGenerationOutcome,
  ImageGenerationRequest,
} from './image-adapter';

/** Generations one factory run may spend on the subscription. */
export const CODEX_IMAGE_RUN_CAP = 6;
const PROVIDER = 'codex-subscription';
const MODEL = 'openai/image_gen';
const EXEC_TIMEOUT_MS = 6 * 60_000;

/** Codex binaries in preference order; `JOVIE_CODEX_BIN` overrides. */
const CODEX_BINARIES = [
  '/Applications/ChatGPT.app/Contents/Resources/codex-cli/bin/codex',
  '/Applications/Codex.app/Contents/Resources/codex',
];

export function resolveCodexBinary(
  env: Readonly<Record<string, string | undefined>> = process.env,
  exists: (path: string) => boolean = existsSync
): string | null {
  if (env.JOVIE_CODEX_BIN) return env.JOVIE_CODEX_BIN;
  return CODEX_BINARIES.find(exists) ?? null;
}

export interface CodexExecResult {
  readonly code: number | null;
  readonly stdout: string;
}

export interface CodexImageAdapterOptions {
  readonly binary?: string | null;
  readonly cap?: number;
  readonly codexHome?: string;
  /** `codex login status` output; must report a ChatGPT login. */
  readonly loginStatus?: (binary: string) => string;
  readonly exec?: (
    binary: string,
    args: readonly string[],
    env: NodeJS.ProcessEnv
  ) => Promise<CodexExecResult>;
  readonly readImage?: (path: string) => Uint8Array;
}

function defaultLoginStatus(binary: string): string {
  const result = spawnSync(binary, ['login', 'status'], {
    encoding: 'utf8',
    timeout: 15_000,
  });
  return `${result.stdout ?? ''}${result.stderr ?? ''}`;
}

function defaultExec(
  binary: string,
  args: readonly string[],
  env: NodeJS.ProcessEnv
): Promise<CodexExecResult> {
  return new Promise(resolve => {
    const child = spawn(binary, args, {
      env,
      stdio: ['ignore', 'pipe', 'ignore'],
    });
    let stdout = '';
    child.stdout.setEncoding('utf8');
    child.stdout.on('data', chunk => {
      stdout += chunk;
    });
    const timer = setTimeout(() => child.kill('SIGTERM'), EXEC_TIMEOUT_MS);
    child.on('error', () => {
      clearTimeout(timer);
      resolve({ code: null, stdout });
    });
    child.on('close', code => {
      clearTimeout(timer);
      resolve({ code, stdout });
    });
  });
}

/** Width and height from a PNG IHDR chunk; null for anything else. */
export function pngSize(
  bytes: Uint8Array
): { width: number; height: number } | null {
  const signature = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  if (bytes.length < 24 || signature.some((b, i) => bytes[i] !== b)) {
    return null;
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  return { width: view.getUint32(16), height: view.getUint32(20) };
}

function threadIdOf(stdout: string): string | null {
  for (const line of stdout.split('\n')) {
    try {
      const event = JSON.parse(line) as { type?: string; thread_id?: string };
      if (event.type === 'thread.started' && event.thread_id) {
        return event.thread_id;
      }
    } catch {
      // Non-JSON noise on stdout is ignored.
    }
  }
  return null;
}

export function promptFor(request: ImageGenerationRequest): string {
  return [
    'Generate exactly one image with your built-in image_gen tool.',
    'Never use the imagegen CLI fallback, scripts/image_gen.py or any API key.',
    'Do not read or write any files. Reply with only the word done.',
    `Aspect ratio about ${request.width}:${request.height}. No text, logos, watermarks or UI.`,
    `Art direction: ${request.brief}`,
    `Subject: ${request.prompt}`,
  ].join('\n');
}

export function createCodexImageAdapter(
  options: CodexImageAdapterOptions = {}
): ImageGenerationAdapter {
  const binary =
    options.binary === undefined ? resolveCodexBinary() : options.binary;
  const cap = options.cap ?? CODEX_IMAGE_RUN_CAP;
  const codexHome =
    options.codexHome ?? process.env.CODEX_HOME ?? join(homedir(), '.codex');
  const loginStatus = options.loginStatus ?? defaultLoginStatus;
  const exec = options.exec ?? defaultExec;
  const readImage = options.readImage ?? (path => readFileSync(path));
  let spent = 0;
  const fail = (
    status: 'credentials-unavailable' | 'failed',
    reason: string
  ): ImageGenerationOutcome => ({ status, provider: PROVIDER, reason });

  return {
    provider: PROVIDER,
    model: MODEL,
    family: 'openai',
    async generate(request) {
      if (!binary) {
        return fail('credentials-unavailable', 'no Codex CLI binary found');
      }
      const status = loginStatus(binary);
      if (!/Logged in using ChatGPT/u.test(status)) {
        return fail(
          'credentials-unavailable',
          `Codex CLI is not logged in with a ChatGPT subscription: ${status.trim().split('\n')[0] ?? 'no status'}`
        );
      }
      if (spent >= cap) {
        return fail('failed', `per-run image cap of ${cap} reached`);
      }
      spent += 1;
      const env = { ...process.env };
      delete env.OPENAI_API_KEY;
      const run = await exec(
        binary,
        [
          'exec',
          '-c',
          'features.hooks=false',
          '-c',
          'features.codex_hooks=false',
          '--json',
          '--ephemeral',
          '--skip-git-repo-check',
          '--sandbox',
          'read-only',
          promptFor(request),
        ],
        env
      );
      const threadId = threadIdOf(run.stdout);
      if (run.code !== 0 || !threadId) {
        return fail('failed', `codex exec exited ${run.code ?? 'by signal'}`);
      }
      const dir = join(codexHome, 'generated_images', threadId);
      const images = existsSync(dir)
        ? readdirSync(dir)
            .filter(name => name.endsWith('.png'))
            .map(name => join(dir, name))
            .toSorted((a, b) => statSync(b).mtimeMs - statSync(a).mtimeMs)
        : [];
      const [path] = images;
      if (!path) {
        return fail('failed', `codex thread ${threadId} saved no image`);
      }
      const bytes = readImage(path);
      const size = pngSize(bytes);
      if (!size) return fail('failed', `codex image ${path} is not a PNG`);
      return {
        status: 'generated',
        provider: PROVIDER,
        model: MODEL,
        bytes,
        mime: 'image/png',
        ...size,
      };
    },
  };
}
