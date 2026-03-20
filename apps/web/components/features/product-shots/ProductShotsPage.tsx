'use client';

import JSZip from 'jszip';
import { useTheme } from 'next-themes';
import { useCallback, useEffect, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import { toast } from 'sonner';
import {
  downloadBlob,
  exportAndDownloadPng,
  exportPng,
} from './export/export-utils';
import type { DeviceType } from './frames/DeviceFrame';
import { ProductShotControls } from './ProductShotControls';
import { ProductShotViewport } from './ProductShotViewport';
import { SCENES, type SceneDefinition } from './scenes';

export function ProductShotsPage() {
  const { setTheme } = useTheme();
  const captureRef = useRef<HTMLDivElement>(null);

  const [selectedScene, setSelectedScene] = useState<SceneDefinition>(
    SCENES[0]
  );
  const [currentTheme, setCurrentTheme] = useState<'light' | 'dark'>('dark');
  const [backgroundColor, setBackgroundColor] = useState('#000000');
  const [pixelRatio, setPixelRatio] = useState(2);
  const [viewportWidth, setViewportWidth] = useState(SCENES[0].defaultWidth);
  const [viewportHeight, setViewportHeight] = useState(SCENES[0].defaultHeight);
  const [device, setDevice] = useState<DeviceType>('none');
  const [isExporting, setIsExporting] = useState(false);
  const [batchProgress, setBatchProgress] = useState<{
    completed: number;
    total: number;
  } | null>(null);

  // Sync theme with next-themes
  useEffect(() => {
    setTheme(currentTheme);
  }, [currentTheme, setTheme]);

  // Update viewport when scene changes
  const handleSceneChange = useCallback((scene: SceneDefinition) => {
    setSelectedScene(scene);
    setViewportWidth(scene.defaultWidth);
    setViewportHeight(scene.defaultHeight);
  }, []);

  // Export single PNG
  const handleExportPng = useCallback(async () => {
    if (!captureRef.current || isExporting) return;
    setIsExporting(true);
    try {
      const filename = `jovie-${selectedScene.id}-${currentTheme}-${pixelRatio}x.png`;
      await exportAndDownloadPng(captureRef.current, filename, {
        pixelRatio,
        backgroundColor:
          backgroundColor === 'transparent' ? undefined : backgroundColor,
      });
      toast.success(`Exported ${filename}`);
    } catch (error) {
      toast.error('Export failed — try a lower resolution');
      console.error('Export failed:', error);
    } finally {
      setIsExporting(false);
    }
  }, [selectedScene, currentTheme, pixelRatio, backgroundColor, isExporting]);

  // Batch export all scenes as ZIP
  const handleBatchExport = useCallback(async () => {
    if (!captureRef.current || isExporting) return;
    setIsExporting(true);
    setBatchProgress({ completed: 0, total: SCENES.length });

    const zip = new JSZip();
    const originalScene = selectedScene;
    let succeeded = 0;

    try {
      for (let i = 0; i < SCENES.length; i++) {
        const scene = SCENES[i];

        // Swap scene and viewport dimensions synchronously so DOM updates before capture
        flushSync(() => {
          setSelectedScene(scene);
          setViewportWidth(scene.defaultWidth);
          setViewportHeight(scene.defaultHeight);
        });

        // Allow the browser a frame to paint the new scene
        await new Promise(resolve => requestAnimationFrame(resolve));

        const filename = `jovie-${scene.id}-${currentTheme}-${pixelRatio}x.png`;
        const blob = await exportPng(captureRef.current!, {
          pixelRatio,
          backgroundColor:
            backgroundColor === 'transparent' ? undefined : backgroundColor,
        });
        zip.file(filename, blob);
        succeeded++;
        setBatchProgress({ completed: i + 1, total: SCENES.length });
      }

      const zipBlob = await zip.generateAsync({ type: 'blob' });
      downloadBlob(
        zipBlob,
        `jovie-product-shots-${currentTheme}-${pixelRatio}x.zip`
      );
      toast.success(`Exported ${succeeded} scenes as ZIP`);
    } catch (error) {
      toast.error(
        `Batch export failed after ${succeeded}/${SCENES.length} scenes`
      );
      console.error('Batch export failed:', error);
    } finally {
      // Restore original scene
      flushSync(() => {
        setSelectedScene(originalScene);
        setViewportWidth(originalScene.defaultWidth);
        setViewportHeight(originalScene.defaultHeight);
      });
      setIsExporting(false);
      setBatchProgress(null);
    }
  }, [selectedScene, currentTheme, pixelRatio, backgroundColor, isExporting]);

  // Keyboard shortcut: Cmd+Shift+S
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.metaKey && e.shiftKey && e.key?.toLowerCase() === 's') {
        e.preventDefault();
        handleExportPng();
      }
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleExportPng]);

  return (
    <div className='flex min-h-screen'>
      <ProductShotControls
        selectedScene={selectedScene}
        onSceneChange={handleSceneChange}
        theme={currentTheme}
        onThemeChange={setCurrentTheme}
        backgroundColor={backgroundColor}
        onBackgroundChange={setBackgroundColor}
        pixelRatio={pixelRatio}
        onPixelRatioChange={setPixelRatio}
        viewportWidth={viewportWidth}
        viewportHeight={viewportHeight}
        onViewportWidthChange={setViewportWidth}
        onViewportHeightChange={setViewportHeight}
        device={device}
        onDeviceChange={setDevice}
        onExportPng={handleExportPng}
        onBatchExport={handleBatchExport}
        isExporting={isExporting}
        batchProgress={batchProgress}
      />
      <ProductShotViewport
        ref={captureRef}
        scene={selectedScene}
        device={device}
        viewportWidth={viewportWidth}
        viewportHeight={viewportHeight}
        backgroundColor={backgroundColor}
        isExporting={isExporting}
        batchProgress={batchProgress}
      />
    </div>
  );
}
