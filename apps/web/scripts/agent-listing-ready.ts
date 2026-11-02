#!/usr/bin/env tsx
import { readFile } from 'node:fs/promises';
/**
 * Re-evaluates the submit gate with the real clock.
 *   pnpm --filter @jovie/web agent-distribution:ready [-- --platform muse]
 * Exit 1 unless the distribution has no blockers and every selected package holds all gates; exit 2 on a bad argument.
 */
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadIconSource, renderIcons } from '@/lib/agent-distribution/icons';
import { LISTING } from '@/lib/agent-distribution/listing';
import { evaluateAll, PLATFORMS } from '@/lib/agent-distribution/readiness';
import { readReadinessInputs } from '@/lib/agent-distribution/readiness-io';

const WEB = resolve(dirname(fileURLToPath(import.meta.url)), '..');

async function main() {
  const index = process.argv.indexOf('--platform');
  const only = index > 0 ? process.argv[index + 1] : null;
  if (only !== null && !(PLATFORMS as readonly string[]).includes(only)) {
    console.error(
      `Unknown platform "${only}". Expected one of: ${PLATFORMS.join(', ')}`
    );
    return 2;
  }
  const snapshot = JSON.parse(
    await readFile(
      resolve(WEB, 'lib/agent-distribution/generated/tools-list.snapshot.json'),
      'utf8'
    )
  );
  const committed = JSON.parse(
    await readFile(
      resolve(WEB, 'lib/agent-distribution/generated/readiness.json'),
      'utf8'
    )
  ) as { blockers?: readonly string[] };
  const blockers = committed.blockers ?? [];
  const inputs = await readReadinessInputs(WEB);
  const iconSource = await loadIconSource(resolve(WEB, '../..'));
  const renderedIcons = iconSource
    ? await renderIcons(
        iconSource,
        resolve(WEB, '.agent-distribution-out/icons')
      )
    : null;
  const all = evaluateAll(
    { ...inputs, renderedIcons },
    LISTING,
    snapshot.toolsListHash,
    new Date()
  );
  let ready = blockers.length === 0;
  for (const blocker of blockers) process.stdout.write(`blocker: ${blocker}\n`);
  for (const platform of PLATFORMS.filter(p => !only || p === only)) {
    const pkg = all[platform];
    ready &&= pkg.ready;
    process.stdout.write(`${platform}: ${pkg.ready ? 'READY' : 'NOT READY'}\n`);
    for (const gate of pkg.missingReceipts)
      process.stdout.write(
        `  ${gate} [${pkg.gates[gate].status}]: ${pkg.gates[gate].reasons.join('; ')}\n`
      );
  }
  return ready ? 0 : 1;
}

main().then(
  code => process.exit(code),
  error => {
    console.error(String(error));
    process.exit(2);
  }
);
