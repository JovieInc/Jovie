'use client';

import { createContext, useContext, type ReactNode } from 'react';

type LinksRailTransform = (panel: ReactNode) => ReactNode;

const identity: LinksRailTransform = panel => panel;

const LinksRailTransformContext = createContext<LinksRailTransform>(identity);

export function LinksRailTransformProvider({
  value,
  children,
}: {
  readonly value: LinksRailTransform;
  readonly children: ReactNode;
}) {
  return (
    <LinksRailTransformContext.Provider value={value}>
      {children}
    </LinksRailTransformContext.Provider>
  );
}

export function useLinksRailTransform(): LinksRailTransform {
  return useContext(LinksRailTransformContext);
}
