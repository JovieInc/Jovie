'use client';

import * as React from 'react';

import { usePerformanceMonitoring } from '@/hooks/usePerformanceOptimizations';

interface PerformanceMonitorProps {
  enabled?: boolean;
  showMetrics?: boolean;
}

export function PerformanceMonitor({
  enabled = process.env.NODE_ENV === 'development',
  showMetrics = false,
}: PerformanceMonitorProps) {
  const metrics = usePerformanceMonitoring();
  const [isVisible, setIsVisible] = React.useState(showMetrics);

  // Keyboard shortcut to toggle performance metrics (dev only)
  React.useEffect(() => {
    if (!enabled) return;

    const handleKeyPress = (e: KeyboardEvent) => {
      // Ctrl/Cmd + Shift + P
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'P') {
        e.preventDefault();
        setIsVisible(!isVisible);
      }
    };

    document.addEventListener('keydown', handleKeyPress);
    return () => document.removeEventListener('keydown', handleKeyPress);
  }, [enabled, isVisible]);

  // Log performance warnings
  React.useEffect(() => {
    if (!enabled || !metrics.navigationTime) return;

    if (metrics.navigationTime > 2000) {
      console.warn(
        '⚠️ Slow navigation detected:',
        metrics.navigationTime + 'ms'
      );
    }

    if (metrics.memoryUsage && metrics.memoryUsage > 0.8) {
      console.warn(
        '⚠️ High memory usage detected:',
        (metrics.memoryUsage * 100).toFixed(1) + '%'
      );
    }
  }, [enabled, metrics]);

  if (!enabled || !isVisible) return null;

  return (
    <div className='fixed bottom-4 right-4 z-[9999] bg-black/90 text-white p-3 rounded-lg text-xs font-mono'>
      <div className='flex items-center gap-2 mb-2'>
        <div className='w-2 h-2 bg-green-400 rounded-full animate-pulse' />
        <span className='font-semibold'>Performance Monitor</span>
        <button
          onClick={() => setIsVisible(false)}
          className='ml-auto text-gray-400 hover:text-white'
        >
          ×
        </button>
      </div>

      <div className='space-y-1'>
        {metrics.navigationTime && (
          <div className='flex justify-between'>
            <span>Navigation:</span>
            <span
              className={
                metrics.navigationTime > 1000
                  ? 'text-yellow-400'
                  : 'text-green-400'
              }
            >
              {metrics.navigationTime.toFixed(0)}ms
            </span>
          </div>
        )}

        {metrics.renderTime && (
          <div className='flex justify-between'>
            <span>Render:</span>
            <span
              className={
                metrics.renderTime > 100 ? 'text-yellow-400' : 'text-green-400'
              }
            >
              {metrics.renderTime.toFixed(1)}ms
            </span>
          </div>
        )}

        {metrics.memoryUsage && (
          <div className='flex justify-between'>
            <span>Memory:</span>
            <span
              className={
                metrics.memoryUsage > 0.7 ? 'text-yellow-400' : 'text-green-400'
              }
            >
              {(metrics.memoryUsage * 100).toFixed(1)}%
            </span>
          </div>
        )}

        <div className='text-gray-400 text-[10px] mt-2 pt-2 border-t border-gray-600'>
          Press Ctrl+Shift+P to toggle
        </div>
      </div>
    </div>
  );
}

// Web Vitals reporter for production
export function reportWebVitals() {
  if (typeof window === 'undefined') return;

  const observer = new PerformanceObserver(list => {
    for (const entry of list.getEntries()) {
      const { name, value } = entry as PerformanceEntry & {
        name: string;
        value: number;
      };

      // Log to analytics in production
      if (process.env.NODE_ENV === 'production') {
        // Replace with your analytics service
        console.log('Web Vital:', { name, value });
      } else {
        console.log(`📊 ${name}:`, value);
      }
    }
  });

  try {
    observer.observe({ entryTypes: ['web-vital'] });
  } catch {
    // Web Vitals not supported
    console.log('Web Vitals not supported in this browser');
  }
}
