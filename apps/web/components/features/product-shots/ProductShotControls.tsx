'use client';

import type { DeviceType } from './frames/DeviceFrame';
import { SCENES, type SceneDefinition } from './scenes';

interface ProductShotControlsProps {
  readonly selectedScene: SceneDefinition;
  readonly onSceneChange: (scene: SceneDefinition) => void;
  readonly theme: 'light' | 'dark';
  readonly onThemeChange: (theme: 'light' | 'dark') => void;
  readonly backgroundColor: string;
  readonly onBackgroundChange: (bg: string) => void;
  readonly pixelRatio: number;
  readonly onPixelRatioChange: (ratio: number) => void;
  readonly viewportWidth: number;
  readonly viewportHeight: number;
  readonly onViewportWidthChange: (w: number) => void;
  readonly onViewportHeightChange: (h: number) => void;
  readonly device: DeviceType;
  readonly onDeviceChange: (device: DeviceType) => void;
  readonly onExportPng: () => void;
  readonly onBatchExport: () => void;
  readonly isExporting: boolean;
  readonly batchProgress: { completed: number; total: number } | null;
}

const BG_PRESETS = [
  { label: 'Transparent', value: 'transparent' },
  { label: 'Black', value: '#000000' },
  { label: 'White', value: '#ffffff' },
  { label: 'Dark Gray', value: '#111111' },
];

const PIXEL_RATIOS = [1, 2, 3, 4];

const DEVICES: Array<{ label: string; value: DeviceType }> = [
  { label: 'None', value: 'none' },
  { label: 'MacBook Pro', value: 'macbook' },
  { label: 'iPhone 16', value: 'iphone' },
  { label: 'iPad Pro', value: 'ipad' },
];

const FOCUS_RING =
  'focus-visible:ring-2 focus-visible:ring-white/30 focus-visible:outline-none';

function SectionLabel({
  children,
  id,
}: {
  readonly children: React.ReactNode;
  readonly id?: string;
}) {
  return (
    <legend
      id={id}
      className='text-[10px] font-semibold uppercase tracking-wider text-neutral-500 mb-1.5 float-left w-full'
    >
      {children}
    </legend>
  );
}

export function ProductShotControls({
  selectedScene,
  onSceneChange,
  theme,
  onThemeChange,
  backgroundColor,
  onBackgroundChange,
  pixelRatio,
  onPixelRatioChange,
  viewportWidth,
  viewportHeight,
  onViewportWidthChange,
  onViewportHeightChange,
  device,
  onDeviceChange,
  onExportPng,
  onBatchExport,
  isExporting,
  batchProgress,
}: ProductShotControlsProps) {
  return (
    <aside
      aria-label='Product shot controls'
      className='sticky top-0 flex h-screen w-64 shrink-0 flex-col overflow-y-auto border-r border-neutral-800 bg-[#0f0f0f] p-4 space-y-5'
    >
      <div>
        <h1 className='text-sm font-semibold text-white'>Product Shots</h1>
        <p className='text-[11px] text-neutral-500 mt-0.5'>Capture tool</p>
      </div>

      {/* Scene selector */}
      <fieldset className='border-none p-0 m-0'>
        <SectionLabel id='scene-label'>Scene</SectionLabel>
        <div className='space-y-0.5'>
          {SCENES.map(scene => (
            <button
              key={scene.id}
              type='button'
              aria-pressed={selectedScene.id === scene.id}
              onClick={() => onSceneChange(scene)}
              className={`w-full text-left rounded px-2 py-1.5 text-[13px] transition-colors ${FOCUS_RING} ${
                selectedScene.id === scene.id
                  ? 'bg-white/10 text-white'
                  : 'text-neutral-400 hover:bg-white/5 hover:text-neutral-300'
              }`}
            >
              {scene.label}
            </button>
          ))}
        </div>
      </fieldset>

      {/* Theme */}
      <fieldset className='border-none p-0 m-0'>
        <SectionLabel id='theme-label'>Theme</SectionLabel>
        <div className='flex gap-1'>
          {(['light', 'dark'] as const).map(t => (
            <button
              key={t}
              type='button'
              aria-pressed={theme === t}
              onClick={() => onThemeChange(t)}
              className={`flex-1 rounded px-2 py-1 text-[12px] capitalize transition-colors ${FOCUS_RING} ${
                theme === t
                  ? 'bg-white/10 text-white'
                  : 'text-neutral-500 hover:bg-white/5'
              }`}
            >
              {t}
            </button>
          ))}
        </div>
      </fieldset>

      {/* Background */}
      <fieldset className='border-none p-0 m-0'>
        <SectionLabel id='bg-label'>Background</SectionLabel>
        <div className='flex gap-1 flex-wrap'>
          {BG_PRESETS.map(preset => (
            <button
              key={preset.value}
              type='button'
              aria-pressed={backgroundColor === preset.value}
              onClick={() => onBackgroundChange(preset.value)}
              className={`rounded px-2 py-1 text-[11px] transition-colors ${FOCUS_RING} ${
                backgroundColor === preset.value
                  ? 'bg-white/10 text-white'
                  : 'text-neutral-500 hover:bg-white/5'
              }`}
            >
              {preset.label}
            </button>
          ))}
        </div>
        <label className='block mt-1.5'>
          <span className='sr-only'>Custom background color (hex)</span>
          <input
            type='text'
            value={backgroundColor}
            onChange={e => onBackgroundChange(e.target.value)}
            placeholder='#hex'
            aria-label='Custom background color'
            className={`w-full rounded bg-neutral-900 border border-neutral-700 px-2 py-1 text-[12px] text-white placeholder:text-neutral-600 focus:border-neutral-500 ${FOCUS_RING}`}
          />
        </label>
      </fieldset>

      {/* Resolution */}
      <fieldset className='border-none p-0 m-0'>
        <SectionLabel id='ratio-label'>Pixel Ratio</SectionLabel>
        <div className='flex gap-1'>
          {PIXEL_RATIOS.map(r => (
            <button
              key={r}
              type='button'
              aria-pressed={pixelRatio === r}
              aria-label={`${r}x pixel ratio`}
              onClick={() => onPixelRatioChange(r)}
              className={`flex-1 rounded px-2 py-1 text-[12px] transition-colors ${FOCUS_RING} ${
                pixelRatio === r
                  ? 'bg-white/10 text-white'
                  : 'text-neutral-500 hover:bg-white/5'
              }`}
            >
              {r}x
            </button>
          ))}
        </div>
      </fieldset>

      {/* Viewport size */}
      <fieldset className='border-none p-0 m-0'>
        <SectionLabel id='viewport-label'>Viewport</SectionLabel>
        <div className='flex gap-2'>
          <label className='flex-1'>
            <span className='text-[10px] text-neutral-600'>W</span>
            <input
              type='number'
              value={viewportWidth}
              aria-label='Viewport width'
              onChange={e =>
                onViewportWidthChange(
                  Math.max(100, Math.min(5000, Number(e.target.value) || 100))
                )
              }
              className={`mt-0.5 w-full rounded bg-neutral-900 border border-neutral-700 px-2 py-1 text-[12px] text-white focus:border-neutral-500 ${FOCUS_RING}`}
            />
          </label>
          <label className='flex-1'>
            <span className='text-[10px] text-neutral-600'>H</span>
            <input
              type='number'
              value={viewportHeight}
              aria-label='Viewport height'
              onChange={e =>
                onViewportHeightChange(
                  Math.max(100, Math.min(5000, Number(e.target.value) || 100))
                )
              }
              className={`mt-0.5 w-full rounded bg-neutral-900 border border-neutral-700 px-2 py-1 text-[12px] text-white focus:border-neutral-500 ${FOCUS_RING}`}
            />
          </label>
        </div>
      </fieldset>

      {/* Device frame */}
      <fieldset className='border-none p-0 m-0'>
        <SectionLabel id='device-label'>Device Frame</SectionLabel>
        <div className='space-y-0.5'>
          {DEVICES.map(d => (
            <button
              key={d.value}
              type='button'
              aria-pressed={device === d.value}
              onClick={() => onDeviceChange(d.value)}
              className={`w-full text-left rounded px-2 py-1 text-[12px] transition-colors ${FOCUS_RING} ${
                device === d.value
                  ? 'bg-white/10 text-white'
                  : 'text-neutral-500 hover:bg-white/5'
              }`}
            >
              {d.label}
            </button>
          ))}
        </div>
      </fieldset>

      {/* Export buttons */}
      <div className='mt-auto pt-4 border-t border-neutral-800 space-y-2'>
        <button
          type='button'
          onClick={onExportPng}
          disabled={isExporting}
          aria-busy={isExporting}
          className={`w-full rounded bg-white text-black text-[13px] font-medium py-2 px-3 hover:bg-neutral-200 disabled:opacity-50 disabled:cursor-not-allowed transition-colors ${FOCUS_RING}`}
        >
          {isExporting ? 'Exporting...' : 'Export PNG'}
        </button>
        <button
          type='button'
          onClick={onBatchExport}
          disabled={isExporting}
          aria-busy={isExporting}
          className={`w-full rounded bg-neutral-800 text-neutral-300 text-[13px] py-2 px-3 hover:bg-neutral-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors ${FOCUS_RING}`}
        >
          {batchProgress
            ? `Batch ${batchProgress.completed}/${batchProgress.total}`
            : 'Batch Export ZIP'}
        </button>
        <p
          className='text-[10px] text-neutral-600 text-center'
          aria-hidden='true'
        >
          ⌘⇧S to export PNG
        </p>
      </div>
    </aside>
  );
}
