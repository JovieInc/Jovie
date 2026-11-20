# Security CSO bus (Summer)

Thin fleet-bus consumer for CSO/security work (audit SEC-03 / tracker SEC-13).

## Contract

1. **Wake:** Linear issue with `security` / `area:security` (or `[secadv-]` / `[security]` title), or a high/critical SARIF-style alert.
2. **Action:** Ensure an investigate packet (`<!-- jovie-security-investigate -->`) on the issue / planned Linear upsert.
3. **Close gate:** Refuse Done until the issue body links a fix PR (`https://github.com/.../pull/N`).
4. **Backstop:** `github:jovie:security-finding-pr` dwell + Summer catch-up; Gem lanes implement.

## CLI

```bash
node scripts/security/cso-bus-consumer.mjs --dry-run <<'JSON'
{"linearIssues":[{"identifier":"JOV-1","title":"[security][high] xss","labels":["security"],"description":""}],"sarifAlerts":[],"closingIdentifiers":["JOV-1"]}
JSON
```

Exit code `2` when a close is blocked. Apply writes stay in Summer catch-up (`CSO_BUS_APPLY` is reserved); this repo owns the planner and gate.

## Related

- Skill `/cso` = audit procedure (not the loop).
- Advisory intake = Dependabot → Linear (`security-advisory-loop.yml`).
- Dwell SLOs = `docs/metrics/stage-manifest.json` entity `security-advisory`.
