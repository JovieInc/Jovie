import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { buildIntegrationFromSignal } from '../lib/integrations/builder';

/** Machine-friendly signal entry point. Never modifies live provider registration. */
async function main() {
  const [signalPath, outputDirectory] = process.argv.slice(2);
  if (!signalPath || !outputDirectory)
    throw new Error(
      'Usage: integrations:build <signal.json> <new-output-directory>'
    );
  const raw = await readFile(signalPath, 'utf8');
  if (Buffer.byteLength(raw) > 4096) throw new Error('Signal exceeds 4KB');
  const result = buildIntegrationFromSignal(JSON.parse(raw));
  if (result.kind === 'existing') {
    process.stdout.write(`${JSON.stringify(result)}\n`);
    return;
  }
  const output = resolve(outputDirectory);
  // Exclusive directory creation prevents overwriting a prior build or operator edits.
  await mkdir(output, { recursive: false });
  for (const [name, content] of Object.entries(result.files)) {
    await writeFile(resolve(output, name), content, { flag: 'wx' });
  }
  await writeFile(
    resolve(output, 'build.json'),
    `${JSON.stringify(result, null, 2)}\n`,
    { flag: 'wx' }
  );
  process.stdout.write(
    `${JSON.stringify({ kind: 'draft', integrationId: result.integrationId, output })}\n`
  );
}

main().catch(error => {
  process.stderr.write(
    `${error instanceof Error ? error.message : 'Integration build failed'}\n`
  );
  process.exitCode = 1;
});
