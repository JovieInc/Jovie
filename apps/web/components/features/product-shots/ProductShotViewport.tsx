'use client';

import { Component, type ErrorInfo, forwardRef, type ReactNode } from 'react';
import { DeviceFrame, type DeviceType } from './frames/DeviceFrame';
import type { SceneDefinition } from './scenes';

/** Error boundary for scene rendering failures */
class SceneErrorBoundary extends Component<
  { readonly children: ReactNode; readonly sceneName: string },
  { hasError: boolean; error: Error | null }
> {
  constructor(props: { children: ReactNode; sceneName: string }) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error(`Scene "${this.props.sceneName}" crashed:`, error, info);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className='flex items-center justify-center h-full bg-neutral-900 text-neutral-400 p-8'>
          <div className='text-center space-y-2'>
            <p className='text-sm font-medium text-red-400'>
              Scene failed to render
            </p>
            <p className='text-xs text-neutral-500'>
              {this.state.error?.message ?? 'Unknown error'}
            </p>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

interface ProductShotViewportProps {
  readonly scene: SceneDefinition;
  readonly device: DeviceType;
  readonly viewportWidth: number;
  readonly viewportHeight: number;
  readonly backgroundColor: string;
  readonly isExporting?: boolean;
  readonly batchProgress?: { completed: number; total: number } | null;
}

export const ProductShotViewport = forwardRef<
  HTMLDivElement,
  ProductShotViewportProps
>(function ProductShotViewport(
  {
    scene,
    device,
    viewportWidth,
    viewportHeight,
    backgroundColor,
    isExporting,
    batchProgress,
  },
  ref
) {
  const SceneComponent = scene.Component;

  return (
    <div className='flex items-center justify-center flex-1 overflow-auto p-8'>
      <div
        ref={ref}
        style={{
          backgroundColor:
            backgroundColor === 'transparent' ? 'transparent' : backgroundColor,
        }}
        className='relative'
      >
        <DeviceFrame device={device}>
          <div
            style={{
              width: viewportWidth,
              height: viewportHeight,
              overflow: 'hidden',
            }}
          >
            <SceneErrorBoundary sceneName={scene.label}>
              <SceneComponent />
            </SceneErrorBoundary>
          </div>
        </DeviceFrame>

        {/* Export overlay */}
        {isExporting && (
          <div className='absolute inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm rounded'>
            <div className='text-center space-y-2'>
              <div className='inline-block h-5 w-5 animate-spin rounded-full border-2 border-white/30 border-t-white' />
              <p className='text-sm font-medium text-white'>
                {batchProgress
                  ? `Capturing ${batchProgress.completed + 1} of ${batchProgress.total}...`
                  : 'Capturing...'}
              </p>
              {batchProgress && (
                <div className='w-32 mx-auto h-1 bg-white/20 rounded-full overflow-hidden'>
                  <div
                    className='h-full bg-white rounded-full transition-all duration-300'
                    style={{
                      width: `${(batchProgress.completed / batchProgress.total) * 100}%`,
                    }}
                  />
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
});
