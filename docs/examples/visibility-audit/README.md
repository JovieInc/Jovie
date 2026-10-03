# Visibility audit

The committed Tim White sample is [`tim.md`](./tim.md). Regenerate it from the verified `/tim` fixture:

```bash
pnpm --dir apps/web visibility-audit -- --out docs/examples/visibility-audit/tim.md
```

The generator reads stored snapshots and operator-entered rows. It does not fetch link-in-bio pages or search results.

## TODO

No outbound requests to third-party or social sites from Jovie's core infrastructure. Any future live fetch, including a Linktree page or a Google SERP, has to go through an isolated provider.
