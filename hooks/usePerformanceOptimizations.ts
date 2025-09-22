'use client';

import { useRouter } from 'next/navigation';
import * as React from 'react';

// Preload navigation routes on hover
export function usePreloadRoutes() {
  const router = useRouter();
  const preloadedRoutes = React.useRef(new Set<string>());

  const preloadRoute = React.useCallback(
    (href: string) => {
      if (preloadedRoutes.current.has(href)) return;

      preloadedRoutes.current.add(href);
      router.prefetch(href);
    },
    [router]
  );

  return { preloadRoute };
}

// Intersection Observer for lazy loading
export function useIntersectionObserver(
  options: IntersectionObserverInit = {}
) {
  const [isIntersecting, setIsIntersecting] = React.useState(false);
  const [hasIntersected, setHasIntersected] = React.useState(false);
  const elementRef = React.useRef<HTMLElement>(null);

  React.useEffect(() => {
    const element = elementRef.current;
    if (!element) return;

    const observer = new IntersectionObserver(([entry]) => {
      setIsIntersecting(entry.isIntersecting);
      if (entry.isIntersecting && !hasIntersected) {
        setHasIntersected(true);
      }
    }, options);

    observer.observe(element);

    return () => {
      observer.disconnect();
    };
  }, [options, hasIntersected]);

  return {
    elementRef,
    isIntersecting,
    hasIntersected,
  };
}

// Debounced updates for performance
export function useDebounce<T>(value: T, delay: number): T {
  const [debouncedValue, setDebouncedValue] = React.useState(value);

  React.useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedValue(value);
    }, delay);

    return () => {
      clearTimeout(handler);
    };
  }, [value, delay]);

  return debouncedValue;
}

// Optimistic updates for navigation
export function useOptimisticNavigation() {
  const [isPending, setIsPending] = React.useState(false);
  const router = useRouter();

  const navigateOptimistically = React.useCallback(
    (href: string, optimisticUpdate?: () => void) => {
      setIsPending(true);

      // Apply optimistic update immediately
      optimisticUpdate?.();

      // Navigate
      router.push(href);

      // Reset pending state after navigation
      setTimeout(() => setIsPending(false), 100);
    },
    [router]
  );

  return {
    isPending,
    navigateOptimistically,
  };
}

// Virtual scrolling for large lists
export function useVirtualList<T>({
  items,
  itemHeight,
  containerHeight,
  overscan = 3,
}: {
  items: T[];
  itemHeight: number;
  containerHeight: number;
  overscan?: number;
}) {
  const [scrollTop, setScrollTop] = React.useState(0);

  const startIndex = Math.floor(scrollTop / itemHeight);
  const endIndex = Math.min(
    startIndex + Math.ceil(containerHeight / itemHeight) + overscan,
    items.length - 1
  );

  const visibleItems = React.useMemo(() => {
    return items
      .slice(Math.max(0, startIndex - overscan), endIndex + 1)
      .map((item, index) => ({
        item,
        index: Math.max(0, startIndex - overscan) + index,
      }));
  }, [items, startIndex, endIndex, overscan]);

  const totalHeight = items.length * itemHeight;
  const offsetY = Math.max(0, startIndex - overscan) * itemHeight;

  return {
    visibleItems,
    totalHeight,
    offsetY,
    onScroll: (e: React.UIEvent<HTMLDivElement>) => {
      setScrollTop(e.currentTarget.scrollTop);
    },
  };
}

// Performance monitoring
export function usePerformanceMonitoring() {
  const [metrics, setMetrics] = React.useState<{
    navigationTime?: number;
    renderTime?: number;
    memoryUsage?: number;
  }>({});

  React.useEffect(() => {
    // Measure navigation performance
    const navigationStart = performance.getEntriesByType('navigation')[0] as
      | PerformanceNavigationTiming
      | undefined;
    if (navigationStart) {
      setMetrics(prev => ({
        ...prev,
        navigationTime:
          navigationStart.loadEventEnd - navigationStart.navigationStart,
      }));
    }

    // Measure render performance
    const observer = new PerformanceObserver(list => {
      for (const entry of list.getEntries()) {
        if (entry.entryType === 'measure') {
          setMetrics(prev => ({
            ...prev,
            renderTime: entry.duration,
          }));
        }
      }
    });

    observer.observe({ entryTypes: ['measure'] });

    // Monitor memory usage (if available)
    if ('memory' in performance) {
      const memoryInfo = (
        performance as Performance & {
          memory: { usedJSHeapSize: number; totalJSHeapSize: number };
        }
      ).memory;
      setMetrics(prev => ({
        ...prev,
        memoryUsage: memoryInfo.usedJSHeapSize / memoryInfo.totalJSHeapSize,
      }));
    }

    return () => {
      observer.disconnect();
    };
  }, []);

  return metrics;
}

// Image lazy loading with blur placeholder
export function useLazyImage(src: string, placeholder?: string) {
  const [imageSrc, setImageSrc] = React.useState(placeholder);
  const [isLoaded, setIsLoaded] = React.useState(false);
  const [hasError, setHasError] = React.useState(false);
  const { elementRef, isIntersecting } = useIntersectionObserver();

  React.useEffect(() => {
    if (!isIntersecting) return;

    const img = new Image();
    img.onload = () => {
      setImageSrc(src);
      setIsLoaded(true);
    };
    img.onerror = () => {
      setHasError(true);
    };
    img.src = src;
  }, [isIntersecting, src]);

  return {
    elementRef,
    imageSrc,
    isLoaded,
    hasError,
  };
}

// Smart batching for API calls
export function useBatchedAPI<T>(
  batchFunction: (items: T[]) => Promise<unknown>,
  delay: number = 100
) {
  const batchQueue = React.useRef<T[]>([]);
  const timeoutRef = React.useRef<NodeJS.Timeout>();

  const addToBatch = React.useCallback(
    (item: T) => {
      batchQueue.current.push(item);

      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }

      timeoutRef.current = setTimeout(() => {
        if (batchQueue.current.length > 0) {
          batchFunction([...batchQueue.current]);
          batchQueue.current = [];
        }
      }, delay);
    },
    [batchFunction, delay]
  );

  React.useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, []);

  return { addToBatch };
}
