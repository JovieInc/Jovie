# Tooltip Component

A minimalist tooltip for surfacing subtle context with pixel-perfect polish.

## Accessibility

- **Content as ReactNode:** The `content` prop accepts any `ReactNode`. Favor plain text or elements with clear ARIA labels so assistive technologies convey the same message.
- **Keep it brief:** Tooltips should supplement UI, not replace it. Aim for a single, concise sentence.
- **Avoid interactivity:** Interactive controls inside tooltips can confuse keyboard and screen‑reader users. If you need interaction, surface it in the main interface instead.

## Usage

```tsx
import { Tooltip } from '@/components/atoms/Tooltip';

<Tooltip content={<span>Save changes</span>}>
  <button>Hover me</button>
</Tooltip>
```
