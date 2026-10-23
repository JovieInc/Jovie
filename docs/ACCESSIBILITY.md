# Accessibility

Jovie targets **WCAG 2.2 Level AA**.

## What blocks a pull request

`A11y (UI paths)` in Source Validation runs when the diff touches a UI path
(`apps/web/app`, `apps/web/components`, `apps/web/styles`, Storybook, the
a11y gate, axe specs, `packages/ui`, or this document). The job is a `needs`
dependency of `PR Ready`, so a failure blocks merge. A diff outside those
paths records a non-applicable receipt and passes. The job always runs; it
is not skipped.

The check renders full HTML documents in Chromium. It does not boot the app,
Neon, or the full E2E suite. A 16px control must fail axe `target-size` and
the rendered box measurement. A 48px control must pass. A signed-in library
shell must pass when its contrast and targets comply, and must fail when
text contrast or a target is too small. That shell is a fixture, not a crawl
of production `/app/*` routes.

Every source pull request also runs `node apps/web/scripts/a11y-wcag-standard-check.cjs`,
which rejects a raw WCAG `.withTags` list, a nonexistent `wcag22a` tag, a
stale allowlist entry, and a drift in this document.

## How axe is configured

`wcag22AaAxeOptions()` in `apps/web/lib/a11y-gates/wcag-standard.cjs` is the
only WCAG tag scan. Tags are `wcag2a`, `wcag2aa`, `wcag21a`, `wcag21aa`, and
`wcag22aa`. `target-size` (WCAG 2.5.8, 24 CSS pixels) is enabled in that same
options object. axe-core leaves the rule off by default, so the tag alone
does not measure it. `target-size` cannot be disabled.

Other disables live in `a11y-allowlist.json`. Each entry has a `JOV-####`
issue id and an expiry date. An entry fails the check after the end of that
UTC day. `maxEntries` must equal the entry count, and the count cannot grow
once the file is on `main`.

Storybook's addon-a11y parameters in `apps/web/lib/a11y-gates/wcag-22-aa.ts`
set `test: 'error'` with those tags and with `color-contrast` and
`target-size` enabled. Preview imports that file so the browser bundle does
not load the Node checker. A violation fails the story.
The main-branch visual-a11y workflow runs that catalog and is not a required
pull request check. The full catalog was not baselined when this gate landed,
so that workflow stays out of `PR Ready`.

## What is not part of PR Ready

The public route crawl (`ci-a11y` / `A11y (axe)` in `ci.yml`) stays on
`workflow_dispatch` and is not part of PR Ready. It was not baselined here.
When it runs, it uses the same WCAG 2.2 AA options, including `target-size`.
The authenticated crawl stays manual and informational.

Biome accessibility rules are warnings. They do not block commits.

`pnpm --filter @jovie/web lint:touch-target` is a source ratchet for explicit
sub-44px hit areas (WCAG 2.5.5 / 44px). It does not measure a rendered box.
Rendered WCAG 2.2 AA target size is axe `target-size`, proved by
`apps/web/tests/a11y/rendered-gate.spec.ts`.

## Patterns

Use a native control before ARIA. Give every image a specific alt, or an
empty alt when it is decorative. Meet 4.5:1 for normal text and 3:1 for
large text. Keep keyboard focus visible.

```tsx
<button type="button" onClick={save}>
  Save
</button>
```

```tsx
<img src="/artist.jpg" alt="Taylor Swift performing on stage" />
```
