# CTAButton (components/atoms/CTAButton)

A token-driven call-to-action built on `@jovie/ui`'s `Button` primitive. It preserves shadcn focus and hover affordances, adds micro-interactions for pressed states, and keeps analytics-friendly link handling consistent across internal and external destinations.

```tsx
import { CTAButton } from '@/components/atoms/CTAButton';

<CTAButton href='/pricing' icon={<SparklesIcon />}>
  Join the waitlist
</CTAButton>

<CTAButton isLoading>Processing</CTAButton>
<CTAButton isSuccess>Saved</CTAButton>
<CTAButton href='https://jovie.so/docs' external>
  Read the docs
</CTAButton>
```

## Props
- `href?: string` – render as a link using `next/link` with proper `rel` + `target` safeguards for external URLs.
- `icon?: React.ReactNode` – optional leading icon; replaced with a success glyph when `isSuccess` is true.
- `isLoading?: boolean` – disables the control, shows the shared spinner, and sets `aria-busy`.
- `isSuccess?: boolean` – announces success with a checkmark and polite `aria-live` semantics.
- `size?: 'sm' | 'md' | 'lg' | 'icon' | 'default'` – maps `md` to the default shadcn size.
- `prefetch?: boolean` – passed to `next/link` for internal navigation.
- All other `@jovie/ui` `ButtonProps` are forwarded for analytics hooks and data-testid stability.
