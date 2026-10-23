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

The expected **raw** Vitest result is **3 passes / 1 failure**, exit 1: healthy
buttons pass with real addon reports, the default empty button reports the
existing `button-name` warning, and the explicit-error empty button fails that
rule. Only the fixture declares `a11y.test: 'error'`. Global modes, WCAG tags,
rules, manual-axe and live-cert behavior stay unchanged.

The diagnostic exits zero only when those actual reports and the expected
failing assertion are present. All-green with missing hooks, missing controls,
healthy-control failures and unrelated render errors are rejected. Output keeps
`runner.log`, `run.json`, `cli.json` and `findings.json`; the expected red raw
suite must not be described as four passing accessibility checks or full-catalog
certification.
