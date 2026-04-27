import { CheckCircle2, Copy } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * CopyToggleIcon — Copy ↔ Check icon swap for copy-to-clipboard buttons.
 *
 * Renders the lucide `Copy` icon when `copied === false`, and the
 * `CheckCircle2` icon (cyan-300) when `copied === true`. Swap is
 * instantaneous (no cross-fade) — the icon itself is the affordance, the
 * caller's tooltip + state timer is what makes it feel responsive.
 *
 * Use inside a `<button>` whose `onClick` flips a `copied` flag for
 * ~1200ms then resets. Keeps the swap consistent across every
 * copy-to-clipboard surface in the shell.
 *
 * @example
 * ```tsx
 * const [copied, setCopied] = useState(false);
 * return (
 *   <button
 *     onClick={() => {
 *       navigator.clipboard.writeText(value);
 *       setCopied(true);
 *       setTimeout(() => setCopied(false), 1200);
 *     }}
 *     aria-label={copied ? 'Copied' : 'Copy'}
 *   >
 *     <CopyToggleIcon copied={copied} />
 *   </button>
 * );
 * ```
 */
export function CopyToggleIcon({
  copied,
  className,
  size,
  strokeWidth = 2.25,
}: {
  copied: boolean;
  className?: string;
  /** Tailwind sizing classes. Defaults to `h-3 w-3` to match shell-v1 buttons. */
  size?: string;
  strokeWidth?: number;
}) {
  const sizing = size ?? 'h-3 w-3';
  return copied ? (
    <CheckCircle2
      className={cn(sizing, 'text-cyan-300', className)}
      strokeWidth={strokeWidth}
    />
  ) : (
    <Copy className={cn(sizing, className)} strokeWidth={strokeWidth} />
  );
}
