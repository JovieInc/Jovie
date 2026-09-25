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
this profile still retains a lower pressure-controller ceiling. Pilot scope stays
project `symphony-ui-pilot-96d6b9c5b2d5` and label
`symphony-five-pr-repair-20260908`. The one-retry ceiling, hooks, workspace,
sandbox, and service port stay as they are.

Drop-ins stay the five reviewed `governor-bounded` units. Attestation compares
those installed files with `scripts/symphony/profiles/governor-bounded/systemd`
at the selected revision. No separate drop-in pin is required.

The agent prompt no longer says native Codex execution is disabled. Every other
instruction matches `governor-bounded`.
