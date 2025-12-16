import { existsSync } from 'node:fs';
import { join } from 'node:path';

const root = process.cwd();

const proxyCandidates = ['proxy.ts', 'proxy.js', 'proxy.mjs'];
const middlewareCandidates = ['middleware.ts', 'middleware.js', 'middleware.mjs'];

const hasProxy = proxyCandidates.some(f => existsSync(join(root, f)));
const hasMiddleware = middlewareCandidates.some(f => existsSync(join(root, f)));

if (hasMiddleware && hasProxy) {
    console.error(
        'Error: Both root middleware and proxy files are present. Remove ./middleware.* and use ./proxy.* only.\n' +
        'See: https://nextjs.org/docs/messages/middleware-to-proxy'
    );
    process.exit(1);
}

if (hasMiddleware && !hasProxy) {
    console.error(
        'Error: Root ./middleware.* detected. This repo uses Next.js proxy convention (./proxy.*).\n' +
        'Remove ./middleware.* and use ./proxy.* only.\n' +
        'See: https://nextjs.org/docs/messages/middleware-to-proxy'
    );
    process.exit(1);
}
