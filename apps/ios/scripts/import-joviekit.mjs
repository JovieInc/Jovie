// Portable immutable import. JovieKit remains owned in Jovie; consumers never edit it.

import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  mkdir,
  mkdtemp,
  readdir,
  readFile,
  rename,
  rm,
  writeFile,
} from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { promisify } from 'node:util';

const receipt = '.jovie-source.json';
const digest = data => createHash('sha256').update(data).digest('hex');
const execute = promisify(execFile);

// Use the host's maintained HTTPS client (including system proxy handling).
// No shell, credentials, redirects, Git clone, retries or upstream code execution.
export async function downloadSource(url, run = execute) {
  const { stdout } = await run(
    'curl',
    [
      '--fail',
      '--silent',
      '--show-error',
      '--max-time',
      '20',
      '--proto',
      '=https',
      '--max-filesize',
      '1000000',
      url,
    ],
    { encoding: 'buffer', maxBuffer: 1_000_001, timeout: 21_000 }
  );
  return { ok: true, arrayBuffer: async () => stdout };
}

export function validateManifest(manifest) {
  if (
    manifest?.schemaVersion !== 1 ||
    manifest.repository !== 'JovieInc/Jovie' ||
    manifest.packagePath !== 'apps/ios/Packages/JovieKit' ||
    !/^[a-f0-9]{40}$/.test(manifest.revision) ||
    !Array.isArray(manifest.files) ||
    manifest.files.length > 64
  ) {
    throw new Error('Expected an immutable JovieKit source manifest');
  }
  const seen = new Set();
  for (const file of manifest.files) {
    if (
      !file ||
      typeof file.path !== 'string' ||
      !/^(Package\.swift|LICENSE|\.gitignore|(?:Sources|Tests)\/[A-Za-z0-9_/-]+\.swift)$/.test(
        file.path
      ) ||
      file.path.includes('//') ||
      seen.has(file.path) ||
      !/^[a-f0-9]{64}$/.test(file.sha256)
    ) {
      throw new Error('Invalid or duplicate source file');
    }
    seen.add(file.path);
  }
  if (
    !seen.has('Package.swift') ||
    !seen.has('LICENSE') ||
    !seen.has('Sources/JovieKit/AppReviewPolicy.swift')
  ) {
    throw new Error('Incomplete JovieKit source manifest');
  }
  return manifest;
}

async function inventory(directory, prefix = '') {
  const files = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    // SwiftPM creates these after import; they are never part of the source receipt.
    if (!prefix && ['.build', '.swiftpm'].includes(entry.name)) continue;
    const path = prefix + entry.name;
    if (entry.isFile()) files.push(path);
    else if (entry.isDirectory())
      files.push(...(await inventory(join(directory, entry.name), `${path}/`)));
    else throw new Error(`Unexpected source entry: ${path}`);
  }
  return files.sort();
}

export async function checkPackage(manifest, destination) {
  validateManifest(manifest);
  const recorded = JSON.parse(
    await readFile(join(destination, receipt), 'utf8')
  );
  if (JSON.stringify(recorded) !== JSON.stringify(manifest))
    throw new Error('Source receipt differs from pin');
  const expected = [...manifest.files.map(file => file.path), receipt].sort();
  if (
    JSON.stringify(await inventory(destination)) !== JSON.stringify(expected)
  ) {
    throw new Error('Missing or unexpected source file');
  }
  for (const file of manifest.files) {
    if (digest(await readFile(join(destination, file.path))) !== file.sha256) {
      throw new Error(`Source checksum mismatch: ${file.path}`);
    }
  }
}

export async function importPackage(
  manifest,
  destination,
  fetchSource = downloadSource
) {
  validateManifest(manifest);
  destination = resolve(destination);
  try {
    await readdir(destination);
    throw new Error(
      'Destination exists; import updates into a fresh directory for review'
    );
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
  // Download and verify everything before materializing any source. No code is executed.
  const downloaded = await Promise.all(
    manifest.files.map(async file => {
      const source =
        file.path === 'LICENSE'
          ? file.path
          : `${manifest.packagePath}/${file.path}`;
      const url = `https://raw.githubusercontent.com/${manifest.repository}/${manifest.revision}/${source}`;
      const response = await fetchSource(url);
      if (!response.ok)
        throw new Error(
          `Source fetch failed (${response.status}): ${file.path}`
        );
      const data = Buffer.from(await response.arrayBuffer());
      if (data.length > 1_000_000 || digest(data) !== file.sha256) {
        throw new Error(`Source checksum mismatch: ${file.path}`);
      }
      return { ...file, data };
    })
  );
  await mkdir(dirname(destination), { recursive: true });
  const stage = await mkdtemp(join(dirname(destination), '.joviekit-import-'));
  try {
    for (const file of downloaded) {
      await mkdir(dirname(join(stage, file.path)), { recursive: true });
      await writeFile(join(stage, file.path), file.data);
    }
    await writeFile(
      join(stage, receipt),
      `${JSON.stringify(manifest, null, 2)}\n`
    );
    await rename(stage, destination);
  } finally {
    await rm(stage, { recursive: true, force: true });
  }
}

export async function runImport(args, fetchSource = downloadSource) {
  const [mode, manifestPath, destination] = args;
  if (
    !['import', 'check'].includes(mode) ||
    !manifestPath ||
    !destination ||
    args.length !== 3
  ) {
    throw new Error(
      'Usage: node import-joviekit.mjs <import|check> <manifest.json> <destination>'
    );
  }
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
  if (mode === 'check') await checkPackage(manifest, destination);
  else await importPackage(manifest, destination, fetchSource);
  return `JovieKit ${mode}: ${manifest.revision} (${manifest.files.length} verified files)`;
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  console.log(await runImport(process.argv.slice(2)));
}
