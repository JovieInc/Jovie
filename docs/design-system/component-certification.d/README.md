# Component certification shards

Each `*.json` file here adds `gates` and `waivers` to
`../component-certification.json`, in the same shape:

```json
{
  "gates": { "apps/web/components/x/Y.tsx": ["ds-owner", "tokens"] },
  "waivers": { "apps/web/components/x/Y.tsx": { "offline": "It never fetches." } }
}
```

A batch PR writes its own file (for example `s05-dashboard-organisms.json`),
so PRs that certify different components never edit the same lines. A component
may appear in only one file. Run `node scripts/component-certificate.mjs --sort`
to keep each file in path order, and `--gate` to check them all.
