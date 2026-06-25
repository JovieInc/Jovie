// design-sync stub: replaces next/link with a plain <a> for browser bundles.
// next/link's prefetch/router integration cannot run in Claude Design's browser
// sandbox. This stub renders the href as a normal anchor; navigation is a no-op
// in the design preview runtime.
import * as React from 'react';

interface LinkProps extends React.AnchorHTMLAttributes<HTMLAnchorElement> {
  readonly href: string | { pathname?: string; query?: Record<string, string> };
  readonly as?: string;
  readonly prefetch?: boolean;
  readonly replace?: boolean;
  readonly scroll?: boolean;
  readonly shallow?: boolean;
  readonly locale?: string | false;
  readonly legacyBehavior?: boolean;
  readonly passHref?: boolean;
}

function Link({
  href,
  children,
  prefetch: _prefetch,
  replace: _replace,
  scroll: _scroll,
  shallow: _shallow,
  locale: _locale,
  legacyBehavior: _legacyBehavior,
  passHref: _passHref,
  as: _as,
  ...rest
}: LinkProps) {
  const resolvedHref =
    typeof href === 'object' && href !== null ? (href.pathname ?? '/') : href;

  return (
    <a href={resolvedHref} {...rest}>
      {children}
    </a>
  );
}

export default Link;
