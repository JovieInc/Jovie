import { readFileSync } from 'node:fs';
import { main } from '../apps/web/lib/ovie/summer-eve-pin-check.ts';

main(process.argv.slice(2), process.env, globalThis.fetch, path =>
  readFileSync(path, 'utf8')
)
  .then(code => {
    process.exit(code);
  })
  .catch((error: unknown) => {
    const message = error instanceof Error ? error.message : 'pin check failed';
    console.error(message);
    process.exit(1);
  });
