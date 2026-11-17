<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## Review guidelines

Report only P0 or P1 bugs that would block a release, each with a repro on input
the app accepts (route, payload or state), expected versus actual, and file and
line. Skip style, refactors, nits and paths that validation already rejects.
Full bar: [docs/REVIEW_BAR.md](../../docs/REVIEW_BAR.md).
