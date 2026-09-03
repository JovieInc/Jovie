import { spawn } from 'node:child_process';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export function buildVitestArgs(args) {
  const hasPassWithNoTests = args.some(
    arg => arg === '--passWithNoTests' || arg.startsWith('--passWithNoTests=')
  );

  return ['run', ...args, ...(hasPassWithNoTests ? [] : ['--passWithNoTests'])];
}

function runVitest(args) {
  return new Promise((finish, fail) => {
    const command = process.platform === 'win32' ? 'vitest.cmd' : 'vitest';
    const child = spawn(command, buildVitestArgs(args), {
      stdio: 'inherit',
    });

    child.once('error', fail);
    child.once('exit', (code, signal) => {
      if (signal) {
        console.error(`Vitest exited from signal ${signal}.`);
        finish(1);
        return;
      }
      finish(code ?? 1);
    });
  });
}

const scriptPath = process.argv[1];
const modulePath = fileURLToPath(import.meta.url);

if (scriptPath && resolve(scriptPath) === modulePath) {
  runVitest(process.argv.slice(2))
    .then(code => {
      process.exitCode = code;
    })
    .catch(error => {
      console.error(error instanceof Error ? error.message : String(error));
      process.exitCode = 1;
    });
}
