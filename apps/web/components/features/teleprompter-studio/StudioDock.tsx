import { Button, IconButton, Kbd } from '@jovie/ui';
import {
  Eye,
  Gauge,
  Grid3x3,
  Layers,
  Sun,
  Volume2,
  VolumeX,
} from 'lucide-react';
import type { Ref } from 'react';
import { cn } from '@/lib/utils';

interface StudioDockProps {
  readonly visible: boolean;
  readonly isRecording: boolean;
  readonly canRecord: boolean;
  /** Between takes the record button records an answer. */
  readonly between: boolean;
  readonly recordButtonRef?: Ref<HTMLButtonElement>;
  readonly followMode: 'voice' | 'speed';
  readonly grid: boolean;
  readonly peek: boolean;
  readonly lightOpen: boolean;
  readonly takesOpen: boolean;
  readonly takeCount: number;
  /** Absent when this browser cannot read questions aloud. */
  readonly voiceEnabled?: boolean;
  readonly onSpeed: () => void;
  readonly onToggleGrid: () => void;
  readonly onTogglePeek: () => void;
  readonly onToggleRecording: () => void;
  readonly onToggleLight: () => void;
  readonly onToggleVoice: () => void;
  readonly onToggleTakes: () => void;
}

/** The floating pill of studio controls around the record button. */
export function StudioDock({
  visible,
  isRecording,
  canRecord,
  between,
  recordButtonRef,
  followMode,
  grid,
  peek,
  lightOpen,
  takesOpen,
  takeCount,
  voiceEnabled,
  onSpeed,
  onToggleGrid,
  onTogglePeek,
  onToggleRecording,
  onToggleLight,
  onToggleVoice,
  onToggleTakes,
}: StudioDockProps) {
  return (
    <section
      aria-label='Studio Controls'
      className={cn(
        'mx-auto flex items-center gap-0.5 rounded-full border border-default bg-surface-3 p-1.5 text-primary-token shadow-xl backdrop-blur-md transition-opacity duration-slow ease-out motion-reduce:transition-none',
        visible ? 'opacity-100' : 'pointer-events-none opacity-0'
      )}
    >
      <Button
        variant='ghost'
        size='sm'
        disabled={followMode === 'voice' && isRecording}
        onClick={onSpeed}
      >
        <Gauge className='mr-1.5 size-3.5' aria-hidden='true' />
        Speed
      </Button>
      <Button
        variant={grid ? 'secondary' : 'ghost'}
        size='sm'
        aria-pressed={grid}
        onClick={onToggleGrid}
      >
        <Grid3x3 className='mr-1.5 size-3.5' aria-hidden='true' />
        Grid
      </Button>
      <Button
        variant={peek ? 'secondary' : 'ghost'}
        size='sm'
        aria-pressed={peek}
        onClick={onTogglePeek}
      >
        <Eye className='mr-1.5 size-3.5' aria-hidden='true' />
        Peek
      </Button>

      <IconButton
        ref={recordButtonRef}
        variant='outline'
        size='xl'
        onClick={onToggleRecording}
        disabled={!canRecord}
        ariaLabel={
          isRecording
            ? 'Stop recording'
            : between
              ? 'Record your answer'
              : 'Start recording'
        }
        className='mx-1.5'
        data-testid='teleprompter-studio-record'
      >
        <span
          aria-hidden='true'
          className={cn(
            'block size-7.5 bg-error transition-transform duration-slow ease-out motion-reduce:transition-none',
            isRecording ? 'scale-50 rounded-sm' : 'rounded-full'
          )}
        />
      </IconButton>

      <Button
        variant={lightOpen ? 'secondary' : 'ghost'}
        size='sm'
        aria-expanded={lightOpen}
        onClick={onToggleLight}
      >
        <Sun className='mr-1.5 size-3.5' aria-hidden='true' />
        Light
      </Button>
      {voiceEnabled === undefined ? null : (
        <Button
          variant={voiceEnabled ? 'secondary' : 'ghost'}
          size='sm'
          aria-pressed={voiceEnabled}
          onClick={onToggleVoice}
        >
          {voiceEnabled ? (
            <Volume2 className='mr-1.5 size-3.5' aria-hidden='true' />
          ) : (
            <VolumeX className='mr-1.5 size-3.5' aria-hidden='true' />
          )}
          Voice
        </Button>
      )}
      <span aria-hidden='true' className='mx-1 h-4.5 w-px bg-surface-2' />
      <Button
        variant='ghost'
        size='sm'
        disabled={takeCount === 0 || isRecording}
        aria-expanded={takesOpen}
        onClick={onToggleTakes}
      >
        <Layers className='mr-1.5 size-3.5' aria-hidden='true' />
        Takes {takeCount > 0 ? takeCount : ''}
      </Button>
      <Kbd className='ml-1 hidden md:inline-flex'>Space</Kbd>
    </section>
  );
}
