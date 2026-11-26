#!/usr/bin/env tsx
/** CLI: pnpm --filter @jovie/web you-proof:seed -- --owner-email=… [--apply] */
import { parseArgs } from 'node:util';
import { db } from '@/lib/db';
import { createYouProofDbStore } from '@/lib/synthetic/you-proof-db-store';
import { runYouProofSeed } from '@/lib/synthetic/you-proof-seed';

function formatStatus(message: string): string {
  if (message === 'status=dry-run') {
    return 'you-proof dry-run only; re-run with --apply after Tim owns the handle';
  }
  if (message === 'status=applied') {
    return 'you-proof applied; verify https://jov.ie/you returns HTTP 200';
  }
  if (message.startsWith('status=blocked;')) {
    return `you-proof blocked: ${message
      .slice('status=blocked;'.length)
      .split(';')
      .join(' | ')}`;
  }
  return message;
}

async function main() {
  const { values } = parseArgs({
    options: {
      apply: { type: 'boolean', default: false },
      'owner-email': { type: 'string' },
    },
    allowPositionals: false,
  });
  const result = await runYouProofSeed({
    ownerEmail: String(values['owner-email'] ?? ''),
    apply: values.apply === true,
    store: createYouProofDbStore(db),
    log: (step, detail) => {
      process.stdout.write(`status=step;${step};${JSON.stringify(detail)}\n`);
    },
  });
  const write = result.exitCode === 0 ? process.stdout : process.stderr;
  for (const message of result.messages)
    write.write(`${formatStatus(message)}\n`);
  process.exitCode = result.exitCode;
}

main()
  .then(() => process.exit(process.exitCode ?? 0))
  .catch(error => {
    process.stderr.write(
      `${error instanceof Error ? error.message : String(error)}\n`
    );
    process.exit(1);
  });
