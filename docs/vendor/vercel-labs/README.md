# Pinned Vercel Labs handbooks

These files are exact-source pins. Do not fetch
`raw.githubusercontent.com/vercel-labs/*/main/command.md` at runtime.

| Handbook | Pin | Product skill? |
|---|---|---|
| `web-interface-guidelines` | `e3d624baaf29dc1fc645aff3e38f03e564d2d6b1` | No. Fold uncovered checks into `/design-canonical` + `/design-review`. |
| `writing-guidelines` | `83e2316b034cf572400513538e4e4da01c4cc742` | No. Optional docs-only later. `canon/VOICE.md` wins. |

Provenance and hashes live in `pins.json`. `pnpm run skill-governance:check`
fails if a pin is missing, mutated, or a skill fetches `main`.

Reviewed for JOV-6188 against `vercel-labs/agent-skills`
`063bee94c3f4df8453406c830b0a7df0f2860278`.
