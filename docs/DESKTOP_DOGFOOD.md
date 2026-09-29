# Desktop dogfood runner

`pnpm desktop:dogfood` is the bounded receipt adapter for JOV-6506. It opens
the installed Electron app on macOS, captures only its front window, reads the
packaged native revision, reads the hosted web revision, snapshots the runner
and account context, attributes new Jovie crash reports, and emits an honest
coverage ledger.

It is not a browser or mocked-Electron certification lane. A non-macOS host,
missing GUI session, missing Screen Recording or Accessibility permission,
unknown account/flags, absent installed build, or failed first capture produces
`queued` / `runner-unverified` and exits 2. It never turns route enumeration or
a still capture into a tested screen.

## Run on the authorized Mac

```bash
JOVIE_DESKTOP_DOGFOOD_RUNNER_ID=<existing-runner-id> \
JOVIE_DESKTOP_DOGFOOD_ACCOUNT_ROLE=creator \
JOVIE_DESKTOP_DOGFOOD_ACCOUNT_FIXTURE=<safe-fixture-name> \
JOVIE_DESKTOP_DOGFOOD_TEST_ACCOUNT=1 \
JOVIE_DESKTOP_DOGFOOD_FEATURE_FLAGS_JSON='[]' \
pnpm desktop:dogfood
```

The default target is `/Applications/Jovie Staging.app`. Override it with
`JOVIE_DESKTOP_DOGFOOD_APP_PATH`; override the hosted origin with
`JOVIE_DESKTOP_DOGFOOD_BASE_URL`. Use
`JOVIE_DESKTOP_DOGFOOD_OUTPUT_DIR` when an existing GUI driver needs a stable
directory in which to place evidence and observations.

## Observation handoff

The run writes `observations.template.json`. An authorized GUI driver may fill
the `observations` array and rerun with
`JOVIE_DESKTOP_DOGFOOD_OBSERVATIONS_PATH=<path>`. Each row identifies an exact
`surface` and `state` from `coverage.json` and uses one disposition:
`not-visited`, `tested-pass`, `tested-fail`, `blocked`, or `not-applicable`.

Tested rows require app-owned relative evidence paths and the complete composed
app inspection checklist exported by `desktop-dogfood-inventory.mjs`. Failed
rows also require a canonical Linear issue, whether that issue was existing or
new, and the semantic dedupe decision. Optional repair-stage, PR, native-retest,
and human-decision fields feed the defect summary. Blocked rows require one
reason and owner. Operator surfaces remain separate and become not applicable
for a non-operator account.

Artifacts are written under `artifacts/desktop-dogfood/<session>/`:

- `report.json`: `jovie-desktop-dogfood/v1` verdict and deduped findings
- `session.json`: runner, native/web identity, window geometry, scale, flags
- `coverage.json`: every enumerated screen/state and its disposition
- `screenshots/first-app-capture.png`: first app-window-only capture
- `crashes/`: Jovie diagnostic reports created during the run

The first capture proves a packaged app session exists. It does not prove
smooth transitions, task completion, or the remaining inventory. Those require
interactive observations from the privileged Mac driver tracked by JOV-6648.
