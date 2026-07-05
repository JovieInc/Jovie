# Canonical Loading States

Three loading states, each with one job. **Never mix them** — a spinner inside a
skeleton is wrong, a full-page progress bar for a list load is wrong.

Source of truth: `@jovie/ui` (`Skeleton`, `LoadingSkeleton`, `ProgressBar`) and
`apps/web/components/atoms/LoadingSpinner.tsx` (`Spinner`).

## When to use each

| State | Use for | Do NOT use for |
|-------|---------|----------------|
| **Skeleton** | Predictable page/list loads where the loaded layout is known ahead of time | In-flight button actions; unknown-shape content |
| **Spinner** | Buttons and inline in-flight actions (save, submit, refresh) | Full-page loads; anything where you can mirror the layout |
| **ProgressBar** | Long uploads/imports where a real percent is known | Loads with no measurable percent; short actions |

Decision rule: **known layout → Skeleton. Known percent → ProgressBar.
Everything else short and inline → Spinner.**

## Skeleton — predictable loads

Mirror the loaded layout 1:1 so nothing shifts when real content arrives
(`.claude/rules/ui.md` → Layout Shift Prevention). Placeholders use the canonical
skeleton tone (`--color-skeleton-base` + shimmer), not `bg-surface-1` directly.

```tsx
import { Skeleton, LoadingSkeleton } from '@jovie/ui';

// A single placeholder sized to the real element
<Skeleton className="h-10 w-10" rounded="full" />   // avatar

// Multi-line text (last line 75% width)
<LoadingSkeleton lines={3} height="h-4" />
```

Skeleton is `aria-hidden`; `LoadingSkeleton` wraps in `role="status" aria-busy`.

## Spinner — in-flight actions

Inline only. Sizes `sm | md | lg`, tones `primary | muted | inverse`.

```tsx
import { Spinner } from '@/components/atoms/LoadingSpinner';

<Button disabled={isSaving}>
  {isSaving && <Spinner size="sm" tone="inverse" />}
  Save
</Button>
```

`Spinner` is an alias of `LoadingSpinner`. It renders an `<output>` with an
`aria-label` and respects `prefers-reduced-motion`.

## ProgressBar — long uploads/imports

Only when a real percent is known. Percent + optional label slot.

```tsx
import { ProgressBar } from '@jovie/ui';

<ProgressBar value={62} label="Importing releases" />
<ProgressBar value={40} size="sm" ariaLabel="Upload progress" showValue={false} />
```

Track is `bg-surface-2`, fill is `bg-accent`, width transitions with
`duration-normal` and stops under reduced motion. Value is clamped to 0–100.
Exposes `role="progressbar"` with `aria-valuenow/min/max`.

## Migrating existing surfaces

Existing ad-hoc bars (`ReleaseTaskProgressBar`, `ImportProgressBanner`,
`ProfileCompletionCard`) predate the canonical `ProgressBar`. Converge each one
onto the primitive when you next touch it — but only with a browser layout-shift
check, since track/label composition is taste-sensitive. Do not attempt a bulk
mechanical sweep: those bars carry custom label logic and live on
taste-sensitive surfaces, so each conversion needs its own visual review.
