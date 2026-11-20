#!/usr/bin/env tsx
/**
 * CLI adapter for live `jov.ie/you` marketing proof seed.
 *
 * Logic + DB adapter are unit-tested under `lib/synthetic/you-proof-*.ts`.
 * Prod apply needs Tim + Doppler; never deletes; never reserves `/you`.
 *
 *   doppler run -p jovie-web -c prd -- pnpm --filter @jovie/web you-proof:seed \
 *     -- --owner-email=tim@example.com [--apply]
 */
import { parseArgs } from 'node:util';
import { db } from '@/lib/db';
import { createYouProofDbStore } from '@/lib/synthetic/you-proof-db-store';
import { runYouProofSeed } from '@/lib/synthetic/you-proof-seed';

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
      process.stdout.write(
        `status=step;${step};${JSON.stringify(detail)}\n`
      );
    },
  });

  for (const message of result.messages) {
    const line = formatYouProofStatus(message);
    if (result.exitCode === 0) process.stdout.write(`${line}\n`);
    else process.stderr.write(`${line}\n`);
  }
  process.exitCode = result.exitCode;
}

function formatYouProofStatus(message: string): string {
  if (message === 'status=dry-run') {
    return 'you-proof dry-run only; re-run with --apply after Tim owns the handle';
  }
  if (message === 'status=applied') {
    return 'you-proof applied; verify https://jov.ie/you returns HTTP 200';
  }
  if (message.startsWith('status=blocked;')) {
    const details = message.slice('status=blocked;'.length).split(';');
    return `you-proof blocked: ${details.join(' | ')}`;
  }
  return message;
}

main()
  .then(() => process.exit(process.exitCode ?? 0))
  .catch(error => {
    process.stderr.write(
      `${error instanceof Error ? error.message : String(error)}\n`
    );
    process.exit(1);
  });
