# agents/

Per-agent role definition files for AgentOS-specific agent types. One `.md` file per agent role.

See `.claude/skills/` for gstack skill examples of the general pattern. AgentOS agent roles defined here are product-specific and go beyond gstack's workflow skills.

Planned roles (from the AgentOS architecture plan):

- `design-lever-scout.md` — discovers design improvement opportunities across authenticated routes
- `design-html-builder.md` — D5 builder: `/design-html` job for approved Design Lab proposals (JOV-1939)
- `visual-qa-agent.md` — screenshot-based visual regression and consistency audit

Defined roles live as `.md` files in this directory. Add new role files when a new agent type is formally approved.
