'use client';

import { createContext, useContext, useMemo } from 'react';

/**
 * Money visibility (JOV-6829). When hidden, payouts, revenue, and balances
 * render redacted everywhere the `<Money>` component or `useMoneyVisibility`
 * hook is used. The provider is seeded server-side from a cookie so redaction
 * applies on first paint with no flash.
 */

const MoneyVisibilityContext = createContext<boolean>(false);

export function MoneyVisibilityProvider({
  hidden,
  children,
}: {
  readonly hidden: boolean;
  readonly children: React.ReactNode;
}) {
  const value = useMemo(() => hidden, [hidden]);
  return (
    <MoneyVisibilityContext.Provider value={value}>
      {children}
    </MoneyVisibilityContext.Provider>
  );
}

/** True when money values must render redacted. */
export function useMoneyVisibility(): boolean {
  return useContext(MoneyVisibilityContext);
}

const REDACTED = '•••';

/**
 * Renders a formatted money string, or the redaction when money is hidden.
 * Use for payouts, revenue, balances, tips, and any other currency value.
 */
export function Money({ children }: { readonly children: React.ReactNode }) {
  const hidden = useMoneyVisibility();
  return <>{hidden ? REDACTED : children}</>;
}
