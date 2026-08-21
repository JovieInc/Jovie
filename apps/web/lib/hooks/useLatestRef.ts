'use client';

import { type RefObject, useLayoutEffect, useRef } from 'react';

/**
 * Keep a ref pointed at the latest value without writing during render.
 * Use for event/async callbacks that must see current props/state.
 */
export function useLatestRef<T>(value: T): RefObject<T> {
  const ref = useRef(value);
  useLayoutEffect(() => {
    ref.current = value;
  });
  return ref;
}
