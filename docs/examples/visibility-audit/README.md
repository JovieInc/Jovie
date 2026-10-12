# Visibility audit

Render the Tim White sample from the verified `/tim` fixture:

```bash
pnpm --dir apps/web visibility-audit
pnpm --dir apps/web visibility-audit -- --out ./tim-visibility-audit.md
```

The rendered sample is pinned by the Vitest snapshot in `apps/web/lib/visibility-audit/__snapshots__/assemble.test.ts.snap` rather than committed under `docs/`. The report lists every DSP registry platform by name, and the brand-scrub gate keeps platform names out of public docs.

The generator reads stored snapshots and operator-entered rows. It does not fetch link-in-bio pages or search results.

## TODO

No outbound requests to third-party or social sites from Jovie's core infrastructure. Any future live fetch, including a Linktree page or a Google SERP, has to go through an isolated provider.
