#!/usr/bin/env tsx

import {
  access,
  mkdir,
  readFile,
  rename,
  rm,
  writeFile,
} from 'node:fs/promises';
import { dirname, extname, isAbsolute, join } from 'node:path';
import { fileURLToPath } from 'node:url';

type VideoStatus = 'pending' | 'done' | 'expired' | 'failed';

interface VideoPromptConfig {
  readonly model: string;
  readonly duration: number;
  readonly resolution: '480p' | '720p';
  readonly referenceImage: string;
  readonly output: string;
}

interface VideoResult {
  readonly status: VideoStatus;
  readonly video?: {
    readonly url?: string;
  };
  readonly error?: {
    readonly message?: string;
  };
}

const ROOT = join(fileURLToPath(new URL('.', import.meta.url)), '..');
const DEFAULT_PROMPT_PATH = 'prompts/video/footer-cta-jovie.md';
const POLL_INTERVAL_MS = 5_000;
const POLL_TIMEOUT_MS = 15 * 60 * 1_000;
const ALLOWED_CONFIG_KEYS = new Set([
  'model',
  'duration',
  'resolution',
  'referenceImage',
  'output',
]);

function resolveFromRoot(path: string): string {
  return isAbsolute(path) ? path : join(ROOT, path);
}

function parseArgs(argv: readonly string[]) {
  const args = {
    promptPath: DEFAULT_PROMPT_PATH,
    validateOnly: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg === '--validate-only') {
      args.validateOnly = true;
      continue;
    }

    if (arg === '--prompt') {
      const next = argv[index + 1];
      if (!next) {
        throw new Error('Missing value for --prompt.');
      }
      args.promptPath = next;
      index += 1;
      continue;
    }

    throw new Error(`Unknown argument: ${arg}`);
  }

  return args;
}

function parsePromptFile(fileContents: string): {
  readonly config: VideoPromptConfig;
  readonly prompt: string;
} {
  if (!fileContents.startsWith('---\n')) {
    throw new Error('Prompt file must start with YAML frontmatter.');
  }

  const closingIndex = fileContents.indexOf('\n---\n', 4);
  if (closingIndex === -1) {
    throw new Error('Prompt file is missing closing YAML frontmatter marker.');
  }

  const frontmatter = fileContents.slice(4, closingIndex).trim();
  const prompt = fileContents.slice(closingIndex + '\n---\n'.length).trim();

  if (!prompt) {
    throw new Error('Prompt body must not be empty.');
  }

  const rawConfig = new Map<string, string>();
  for (const line of frontmatter.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed) {
      continue;
    }

    const separatorIndex = trimmed.indexOf(':');
    if (separatorIndex === -1) {
      throw new Error(`Invalid frontmatter line: ${line}`);
    }

    const key = trimmed.slice(0, separatorIndex).trim();
    const value = trimmed.slice(separatorIndex + 1).trim();

    if (!ALLOWED_CONFIG_KEYS.has(key)) {
      throw new Error(`Unsupported frontmatter key: ${key}`);
    }

    rawConfig.set(key, value);
  }

  const requiredKeys = [
    'model',
    'duration',
    'resolution',
    'referenceImage',
    'output',
  ] as const;
  for (const key of requiredKeys) {
    if (!rawConfig.has(key)) {
      throw new Error(`Missing required frontmatter key: ${key}`);
    }
  }

  const duration = Number.parseInt(rawConfig.get('duration') ?? '', 10);
  if (!Number.isInteger(duration) || duration < 1 || duration > 15) {
    throw new Error('duration must be an integer from 1 to 15.');
  }

  const resolution = rawConfig.get('resolution');
  if (resolution !== '480p' && resolution !== '720p') {
    throw new Error('resolution must be either 480p or 720p.');
  }

  return {
    config: {
      model: rawConfig.get('model') ?? '',
      duration,
      resolution,
      referenceImage: rawConfig.get('referenceImage') ?? '',
      output: rawConfig.get('output') ?? '',
    },
    prompt,
  };
}

function getImageMimeType(path: string): string {
  const extension = extname(path).toLowerCase();

  if (extension === '.png') {
    return 'image/png';
  }

  if (extension === '.jpg' || extension === '.jpeg') {
    return 'image/jpeg';
  }

  if (extension === '.webp') {
    return 'image/webp';
  }

  throw new Error(
    `Unsupported reference image extension: ${extension || '(none)'}`
  );
}

async function fileToDataUri(path: string): Promise<string> {
  const mimeType = getImageMimeType(path);
  const image = await readFile(path);
  return `data:${mimeType};base64,${image.toString('base64')}`;
}

async function assertReadableFile(path: string, label: string): Promise<void> {
  try {
    await access(path);
  } catch {
    throw new Error(`${label} does not exist: ${path}`);
  }
}

async function postJson(
  url: string,
  apiKey: string,
  body: unknown
): Promise<unknown> {
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  const text = await response.text();
  const data = text ? JSON.parse(text) : {};

  if (!response.ok) {
    const message =
      typeof data === 'object' &&
      data !== null &&
      'error' in data &&
      typeof data.error === 'object' &&
      data.error !== null &&
      'message' in data.error
        ? String(data.error.message)
        : text;
    throw new Error(`xAI request failed (${response.status}): ${message}`);
  }

  return data;
}

async function getJson(url: string, apiKey: string): Promise<unknown> {
  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${apiKey}`,
    },
  });

  const text = await response.text();
  const data = text ? JSON.parse(text) : {};

  if (!response.ok) {
    throw new Error(`xAI poll failed (${response.status}): ${text}`);
  }

  return data;
}

function readRequestId(data: unknown): string {
  if (
    typeof data === 'object' &&
    data !== null &&
    'request_id' in data &&
    typeof data.request_id === 'string'
  ) {
    return data.request_id;
  }

  throw new Error('xAI response did not include request_id.');
}

function readVideoResult(data: unknown): VideoResult {
  if (
    typeof data === 'object' &&
    data !== null &&
    'status' in data &&
    typeof data.status === 'string'
  ) {
    return data as VideoResult;
  }

  throw new Error('xAI poll response did not include a status.');
}

async function pollForVideoUrl(
  requestId: string,
  apiKey: string
): Promise<string> {
  const startedAt = Date.now();

  while (Date.now() - startedAt < POLL_TIMEOUT_MS) {
    const result = readVideoResult(
      await getJson(`https://api.x.ai/v1/videos/${requestId}`, apiKey)
    );

    if (result.status === 'done') {
      const url = result.video?.url;
      if (!url) {
        throw new Error('xAI marked the request done without a video URL.');
      }
      return url;
    }

    if (result.status === 'expired') {
      throw new Error('xAI video generation request expired.');
    }

    if (result.status === 'failed') {
      throw new Error(
        result.error?.message ?? 'xAI video generation request failed.'
      );
    }

    console.log('Video still processing...');
    await new Promise(resolve => setTimeout(resolve, POLL_INTERVAL_MS));
  }

  throw new Error('Timed out waiting for xAI video generation.');
}

async function downloadVideo(url: string, outputPath: string): Promise<void> {
  const response = await fetch(url);
  if (!response.ok || !response.body) {
    throw new Error(`Failed to download generated video: ${response.status}`);
  }

  const tempPath = `${outputPath}.tmp-${Date.now()}`;
  await mkdir(dirname(outputPath), { recursive: true });

  try {
    const bytes = new Uint8Array(await response.arrayBuffer());
    await writeFile(tempPath, bytes);
    await rename(tempPath, outputPath);
  } catch (error) {
    await rm(tempPath, { force: true });
    throw error;
  }
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const promptPath = resolveFromRoot(args.promptPath);
  await assertReadableFile(promptPath, 'Prompt file');

  const { config, prompt } = parsePromptFile(
    await readFile(promptPath, 'utf8')
  );
  const referenceImagePath = resolveFromRoot(config.referenceImage);
  const outputPath = resolveFromRoot(config.output);
  await assertReadableFile(referenceImagePath, 'Reference image');

  const apiKey = process.env.XAI_API_KEY;
  if (!apiKey) {
    throw new Error('XAI_API_KEY must be set.');
  }

  if (args.validateOnly) {
    console.log('Footer CTA video prompt is valid.');
    return;
  }

  console.log('Starting xAI footer CTA video generation...');
  const requestId = readRequestId(
    await postJson('https://api.x.ai/v1/videos/generations', apiKey, {
      model: config.model,
      prompt,
      image: {
        url: await fileToDataUri(referenceImagePath),
      },
      duration: config.duration,
      resolution: config.resolution,
    })
  );

  console.log(`Generation request: ${requestId}`);
  const videoUrl = await pollForVideoUrl(requestId, apiKey);
  await downloadVideo(videoUrl, outputPath);
  console.log(`Saved generated video to ${outputPath}`);
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
