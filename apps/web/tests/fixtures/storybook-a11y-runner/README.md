# Storybook accessibility runner controls (JOV-8825)

From the repository root, using its pinned Node/pnpm:

```sh
node apps/web/scripts/verify-storybook-a11y-runner.mjs
```

An optional first argument selects a local output directory. The command uses
the canonical `apps/web/vitest.config.storybook.mts`, actual project preview and
installed addons, one Chromium worker, no retries, and the existing browser
ownership/cleanup lifecycle. It opts into these four stories only; they are
outside the normal catalog. There is no alternate Vitest config or injected
preview-annotation override. No hosted CI job or policy is added.

The expected **raw** Vitest result is **2 passes / 2 failures**, exit 1: healthy
buttons pass with real addon reports, and both empty buttons fail `button-name`
because preview `a11y.test` is `'error'`. A warning-only result is a regression.
This fixture is not full-catalog certification. Global tags include `wcag22aa`
and enable `target-size`; these controls are 48px so the diagnostic stays on
`button-name`.

The diagnostic exits zero only when those actual reports and the expected
failing assertion are present. All-green with missing hooks, missing controls,
healthy-control failures and unrelated render errors are rejected. Output keeps
`runner.log`, `run.json`, `cli.json` and `findings.json`; the expected red raw
suite must not be described as four passing accessibility checks or full-catalog
certification.
