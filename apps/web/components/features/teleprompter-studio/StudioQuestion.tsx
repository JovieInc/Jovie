import { Button } from '@jovie/ui';
import { Volume2, VolumeX } from 'lucide-react';

interface StudioQuestionProps {
  readonly question: string;
  /** Status line under the question, such as why the voice is muted. */
  readonly voiceStatus: string;
  readonly voiceEnabled: boolean;
  readonly onAnswer: () => void;
  readonly onNextQuestion: () => void;
  readonly onBackToScript: () => void;
}

/** Between takes: Jovie asks one interviewer question. */
export function StudioQuestion({
  question,
  voiceStatus,
  voiceEnabled,
  onAnswer,
  onNextQuestion,
  onBackToScript,
}: StudioQuestionProps) {
  return (
    <section
      aria-live='polite'
      className='flex flex-col items-start gap-5 pt-12'
      data-testid='teleprompter-studio-question'
    >
      <span className='flex items-center gap-2 text-app text-on-media/70 font-medium'>
        <span aria-hidden='true' className='size-4.5 rounded-full bg-accent' />
        Jovie asks
      </span>
      <p className='max-w-md text-2xl leading-tight tracking-tight md:text-3xl xl:text-4xl font-semibold text-balance'>
        {question}
      </p>
      <span className='flex items-center gap-2 text-app text-on-media/55'>
        {voiceEnabled ? (
          <Volume2 className='size-3.5' aria-hidden='true' />
        ) : (
          <VolumeX className='size-3.5' aria-hidden='true' />
        )}
        {voiceStatus}
      </span>
      <div className='flex flex-wrap gap-2'>
        <Button variant='primary' onClick={onAnswer}>
          Answer On Camera
        </Button>
        <Button variant='secondary' onClick={onNextQuestion}>
          Another Question
        </Button>
        <Button variant='ghost' onClick={onBackToScript}>
          Back To Script
        </Button>
      </div>
    </section>
  );
}

/** While recording an answer, the question stays on screen as a cue. */
export function StudioAnswerCue({ question }: { readonly question: string }) {
  return (
    <section className='pt-12' data-testid='teleprompter-studio-answering'>
      <span className='text-app text-on-media/55'>Answering</span>
      <p className='mt-3 max-w-md text-xl leading-tight tracking-tight md:text-2xl xl:text-3xl text-on-media/80 font-semibold text-balance'>
        {question}
      </p>
    </section>
  );
}
