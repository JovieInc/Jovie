import { main } from '../apps/web/lib/ovie/summer-eve-pin-check.ts';

main(process.argv.slice(2))
  .then(code => {
    process.exit(code);
  })
  .catch((error: unknown) => {
    const message = error instanceof Error ? error.message : 'pin check failed';
    console.error(message);
    process.exit(1);
  });
