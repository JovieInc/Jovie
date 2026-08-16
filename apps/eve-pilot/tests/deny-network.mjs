import { writeFileSync } from 'node:fs';

globalThis.fetch = async () => {
  const sentinel = process.env.EVE_SMOKE_NETWORK_SENTINEL;

  if (sentinel) writeFileSync(sentinel, 'blocked\n', { flag: 'a' });
  throw new Error('Network access is disabled for the Eve smoke test.');
};
