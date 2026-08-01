# agents/

Per-agent role definition files for AgentOS-specific agent types. One `.md` file per agent role.

See `.claude/skills/` for gstack skill examples of the general pattern. AgentOS agent roles defined here are product-specific and go beyond gstack's workflow skills.

Defined / planned roles:

- `design-taste-department.md` — Design/Taste department agent: policy-backed UI diff taste enforcement (JOV-2012)
- `design-html-builder.md` — D5 builder: `/design-html` job for approved Design Lab proposals (JOV-1939)
- `design-lever-scout.md` — (planned) discovers design improvement opportunities across authenticated routes
- `visual-qa-agent.md` — (planned) screenshot-based visual regression and consistency audit

Defined roles live as `.md` files in this directory. Add new role files when a new agent type is formally approved.
