# Governor-bounded profile with native Codex

This is the restricted continuous governor runtime with native Codex enabled.
Tim approved option B on 2026-09-24 at 18:01 PT: native router, Codex Luna primary.
It uses the existing Symphony service and attestation timer. It is configuration,
not a controller, scheduler, execution grant, or commissioning receipt.

Select `JOVIE_CONFIGURATION_PROFILE=governor-bounded-codex` with the reviewed
`JOVIE_CONFIGURATION_SOURCE_REVISION` in `runner-source.env`. This is not the
default. `governor-bounded` stays Codex OUT. The canonical profile,
`zz-upstream-cutover`, and the `ALIGN_ALLOW_CHECKOUT=1` gate are unchanged.

The workflow matches `governor-bounded` except:

- `codex.command` is `env SYMPHONY_CODEX_DISABLE_APPS=1 symphony-agent-router app-server`
- source `max_concurrent_agents` is 5
- the fleet installer verification requires Codex IN

Switching from a Codex OUT workflow adopts that reviewed ceiling of 5. Reinstalling
this profile still retains a lower pressure-controller ceiling. Intake is team-wide
on JOV. The required label is the existing `agent-ready` dispatch label, including
`Todo`. `ready-for-intake` stays an alternate orchestrator mark and is not a second
required label, because Symphony `required_labels` is conjunctive. Active states
stay `Todo`, `In Progress`, `Rework`, and `Merging`.

`excluded_labels` keeps `no-symphony` and adds the existing deploy, permissions,
billing, and spend labels: `vercel`, `infra`, `area:infra`, `infrastructure`,
`blocked:auth`, `auth`, `area:auth`, `billing`, `blocked:payments`, `stripe`, and
`cost-monitoring`. It also excludes `hold`, `protected`, and `human-only`.
`protected-items.json` denies JOV-5914, JOV-6519, pull requests #17453, #17156,
#18299, and #17511, the listed branches, and any `zz-upstream*` label.
`after_create` runs `symphony-protected-intake-check` before clone, before
`before_run` lease checks, and before routing. A missing or unparseable list,
or unresolved pull/branch linkage, refuses intake. The scheduler still has no
native identifier denylist. Legacy human-review labels are not exclusions.
The one-retry ceiling, sandbox, and service port stay as they are. Host install
of this workflow is held until the exact SHA is approved.

Drop-ins stay the five reviewed `governor-bounded` units. Attestation compares
those installed files with `scripts/symphony/profiles/governor-bounded/systemd`
at the selected revision. No separate drop-in pin is required.

The agent prompt no longer says native Codex execution is disabled. The tracker
and intake paragraph are the team-wide `agent-ready` filter above. `after_create`
runs the protected-item check before the managed workspace wrapper. Sandbox,
port, and retry ceiling match `governor-bounded`.
