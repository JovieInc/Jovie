// @coverage-via apps/web/tests/unit/marketing/no-orphan-text.test.tsx
import type { ReactNode } from 'react';

/**
 * Line-break guard for marketing headlines (ui.md "Line Break Quality").
 *
 * `text-wrap: balance` still leaves a single word on the last line when that
 * word is long ("Smart Artist / Collections"), and Chromium skips balancing
 * entirely under `line-clamp`. Binding the final two words into one
 * inline-block keeps them on the same line whenever they fit; when the pair is
 * wider than the line, the inline-block shrinks to the line and wraps inside
 * itself, so it never forces horizontal overflow.
 *
 * Non-string children and strings under three words render unchanged.
 */
export function NoOrphanText({ children }: { readonly children: ReactNode }) {
  if (typeof children !== 'string') return children;
  const match = /^(.*\S\s+)(\S+\s+\S+)$/s.exec(children.trim());
  if (!match) return children;
  return (
    <>
      {match[1]}
      <span className='inline-block'>{match[2]}</span>
    </>
  );
}
