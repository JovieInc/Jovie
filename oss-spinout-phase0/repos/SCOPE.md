# OSS Spin-Out — Repo Scope & Names (Phase 0)

Decision-ready mapping. Owners: Summer (CoS). Status: DRAFT.

## Repo names (final)
1. `jovie-shipper` — autonomous ship agent (CLI + SKILL.md). THE MOAT.
2. `agent-ops-skills` — curated ops/shipping SKILL.md pack (clone-adjacent volume play, ships first).
3. `voice-memo-ops` — voice memo → action pipeline (CLI + SKILL.md, unique counter-programming).
4. `agent-launch-law` — "how to launch OSS in 2026" meta SKILL.md + essay (dogfoods the plan).
5. `agent-fleet-kit` — spin up your own agent fleet (SKILL.md + config templates, OpenClaw reach).

## GitHub home
- Company repos remain under the existing `JovieInc` organization. Do **not** create a second Jovie org.
- OSS spin-outs should use `itstimwhite` repositories unless/until Tim explicitly chooses to publish them under `JovieInc`.
- GitHub Sponsors is already live on Tim's personal profile: `https://github.com/sponsors/itstimwhite`.
- Sponsorship tiers and payouts belong to the personal Sponsors profile; no additional org or Sponsors setup is required for Phase 0.

## License
- All repos: MIT (matches the gstack/gbrain/agent-skills wave).
- MIT template: see LICENSE.md in each repo dir.

## Layout (SKILL.md packs)
- `skills/` dir, `SKILL.md` with YAML frontmatter (name, description, version, category, tags).
- Installable via `vercel-labs/skills` (`npx skills add jovie/<repo>`).
- Validate against agentskills.io + vercel-labs/skills discovery rules before launch.