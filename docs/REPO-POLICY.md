# Repository Policy — JovieInc

## Why repos are public

`JovieInc/Jovie` and `JovieInc/logyourbody` are made **public only to use GitHub Actions CI minutes on the free tier**. Neither is an intentional open-source release. Both are proprietary codebases owned by Jovie Technology Inc.

If a GitHub Team plan (unlimited private CI minutes) becomes cost-effective, both repos should move private. The license in each repo already reflects proprietary terms.

## Repo visibility map

| Repo | Visibility | Reason |
|------|-----------|--------|
| `JovieInc/Jovie` | Public | CI minutes |
| `JovieInc/logyourbody` | Public | CI minutes |
| `JovieInc/gbrain` | Private | Contains personal knowledge graph — must stay private |
| ceo-plans / agent configs | Private / local | Strategic content — never in public repos |
| Hermes configs (`~/.hermes/`) | Local only | Secrets and orchestration logic — never committed to public repos |

## What must never land in public repos

- **gbrain content** — personal knowledge graph entries, meeting notes, strategic context
- **ceo-plans** — kept in `~/.gstack/projects/…/ceo-plans/` (local machine) or a private repo
- **Secrets or credentials** — even expired; use Doppler + `gitleaks` gate (see `JovieInc/Jovie#10940`)
- **Agent configs with private topology** — Hermes service config, Tailscale IPs, orchestration scripts
- **Investor and legal material** — approved public investor-portal or deck copy required to serve the product may live with the code; private investor notes, legal documents, deal terms, diligence material, and investor-specific strategy must stay in Google Drive or a dedicated private repo

## License signaling

Every Jovie-owned package must carry proprietary terms:

- Root `LICENSE` file → "© Jovie Technology Inc. All rights reserved."
- No `"license": "MIT"` (or any OSS SPDX identifier) in first-party `package.json` files.
- Vendored third-party tools (e.g. `.agents/skills/gstack/`) may retain their upstream MIT license — that is a dependency credit, not a claim about the enclosing codebase.

## Contributing

Only Jovie Technology Inc. employees and contractors with an existing IP-assignment agreement may contribute. The repos are not open to external pull requests. See `CONTRIBUTING.md` for internal workflow.

## Dependency credits vs. OSS claims

Legitimate dependency-credit pages (e.g. `shared/legal/open-source-licenses.md`, iOS "Open Source Licenses" screen) credit the open-source libraries Jovie *uses*. These are fine. They must not be mistaken for — or expanded into — a claim that Jovie's own code is open source.

## Related issues

- `JovieInc/Jovie#10411` — credential leak; requires human key rotation
- `JovieInc/Jovie#10940` — CI gitleaks / secret-scan hardening (route to OWL)
- `JovieInc/logyourbody#402` — LYB LICENSE MIT→proprietary fix
