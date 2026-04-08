import { spawn } from 'node:child_process';
import process from 'node:process';
import { getLighthousePublicSurfaceManifest } from '@/tests/e2e/utils/public-surface-manifest';

const DEFAULT_BASE_URL =
  process.env.BASE_URL?.trim() || 'http://127.0.0.1:3200';

function runCommand(
  command: string,
  args: readonly string[],
  env: NodeJS.ProcessEnv
) {
  return new Promise<void>((resolve, reject) => {
    const child = spawn(command, args, {
      env,
      stdio: 'inherit',
    });

    child.on('exit', code => {
      if (code === 0) {
        resolve();
        return;
      }

      reject(new Error(`${command} exited with code ${code ?? 'unknown'}`));
    });
    child.on('error', reject);
  });
}

async function main() {
  const surfaces = await getLighthousePublicSurfaceManifest();
  const urls = surfaces.map(surface =>
    new URL(surface.resolvedPath, DEFAULT_BASE_URL).toString()
  );

  const args = [
    'exec',
    'lhci',
    'autorun',
    '--config=.lighthouserc.public-launch.json',
    ...urls.map(url => `--collect.url=${url}`),
  ];

  await runCommand('pnpm', args, process.env);
}

void main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
