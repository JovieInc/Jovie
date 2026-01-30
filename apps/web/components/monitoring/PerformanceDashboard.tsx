'use client';

import { useEffect, useState } from 'react';
import type { Metric } from 'web-vitals';

interface PerformanceMetric {
  name: string;
  value: number;
  rating: 'good' | 'needs-improvement' | 'poor';
  timestamp: number;
}

interface PerformanceDashboardProps {
  showDebug?: boolean;
}

export function PerformanceDashboard({
  showDebug = false,
}: PerformanceDashboardProps) {
  const [metrics, setMetrics] = useState<Record<string, PerformanceMetric>>({});
  const [expanded, setExpanded] = useState<boolean>(false);

  // Listen for web vitals metrics
  useEffect(() => {
    if (typeof window === 'undefined') return;

    // Create a custom event listener for web vitals metrics
    const handleWebVitalMetric = (event: CustomEvent) => {
      const metric = event.detail as Metric & {
        rating: 'good' | 'needs-improvement' | 'poor';
      };

      setMetrics(prev => ({
        ...prev,
        [metric.name]: {
          name: metric.name,
          value: metric.value,
          rating: metric.rating,
          timestamp: Date.now(),
        },
      }));
    };

    // Add event listener
    globalThis.addEventListener(
      'web-vitals',
      handleWebVitalMetric as EventListener
    );

    // Clean up
    return () => {
      globalThis.removeEventListener(
        'web-vitals',
        handleWebVitalMetric as EventListener
      );
    };
  }, []);

  // Only render in development or when showDebug is true
  if (process.env.NODE_ENV !== 'development' && !showDebug) {
    return null;
  }

  // Format metric value based on metric name
  const formatMetricValue = (name: string, value: number): string => {
    switch (name.toLowerCase()) {
      case 'cls':
        return value.toFixed(3);
      case 'lcp':
      case 'fcp':
      case 'fid':
      case 'ttfb':
        return `${value.toFixed(0)}ms`;
      default:
        return value.toFixed(2);
    }
  };

  // Get color based on rating
  const getRatingColor = (rating: string): string => {
    switch (rating) {
      case 'good':
        return 'bg-green-100 text-green-800';
      case 'needs-improvement':
        return 'bg-yellow-100 text-yellow-800';
      case 'poor':
        return 'bg-red-100 text-red-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  // Get metric display name
  const getMetricDisplayName = (name: string): string => {
    switch (name.toLowerCase()) {
      case 'cls':
        return 'CLS';
      case 'lcp':
        return 'LCP';
      case 'fid':
        return 'FID';
      case 'fcp':
        return 'FCP';
      case 'ttfb':
        return 'TTFB';
      default:
        return name.toUpperCase();
    }
  };

  return (
    <div className='fixed bottom-4 right-4 z-50'>
      <div className='bg-white rounded-lg shadow-lg overflow-hidden'>
        <button
          type='button'
          className='w-full px-4 py-2 bg-indigo-600 text-white cursor-pointer flex justify-between items-center'
          onClick={() => setExpanded(!expanded)}
          aria-expanded={expanded}
          aria-label='Toggle performance metrics'
        >
          <h3 className='text-sm font-medium'>Performance Metrics</h3>
          <span aria-hidden='true'>{expanded ? '▼' : '▲'}</span>
        </button>

        {expanded && (
          <div className='p-4'>
            {Object.keys(metrics).length === 0 ? (
              <p className='text-sm text-gray-500'>Collecting metrics...</p>
            ) : (
              <div className='space-y-2'>
                {Object.values(metrics).map(metric => (
                  <div
                    key={metric.name}
                    className='flex items-center justify-between'
                  >
                    <span className='text-sm font-medium'>
                      {getMetricDisplayName(metric.name)}:
                    </span>
                    <span
                      className={`text-sm px-2 py-1 rounded ${getRatingColor(metric.rating)}`}
                    >
                      {formatMetricValue(metric.name, metric.value)}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
