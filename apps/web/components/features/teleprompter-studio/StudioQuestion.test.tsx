import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { StudioAnswerCue, StudioQuestion } from './StudioQuestion';

describe('StudioQuestion', () => {
  it('asks the question and offers the three ways on', () => {
    const onAnswer = vi.fn();
    const onNextQuestion = vi.fn();
    const onBackToScript = vi.fn();
    render(
      <StudioQuestion
        question='What does this song mean to you?'
        voiceStatus='Muted on laptop speakers'
        voiceEnabled={false}
        onAnswer={onAnswer}
        onNextQuestion={onNextQuestion}
        onBackToScript={onBackToScript}
      />
    );

    expect(
      screen.getByText('What does this song mean to you?')
    ).toBeInTheDocument();
    expect(screen.getByText('Muted on laptop speakers')).toBeInTheDocument();
    fireEvent.click(screen.getByText('Answer On Camera'));
    fireEvent.click(screen.getByText('Another Question'));
    fireEvent.click(screen.getByText('Back To Script'));
    expect(onAnswer).toHaveBeenCalledOnce();
    expect(onNextQuestion).toHaveBeenCalledOnce();
    expect(onBackToScript).toHaveBeenCalledOnce();
  });

  it('keeps the question on screen while answering', () => {
    render(<StudioAnswerCue question='Where did you write it?' />);

    expect(
      screen.getByTestId('teleprompter-studio-answering')
    ).toHaveTextContent('Where did you write it?');
  });

  it('passes axe asking, with voice on, and as the answer cue', async () => {
    for (const voiceEnabled of [false, true]) {
      const { container, unmount } = render(
        <StudioQuestion
          question='What does this song mean to you?'
          voiceStatus='Muted on laptop speakers'
          voiceEnabled={voiceEnabled}
          onAnswer={vi.fn()}
          onNextQuestion={vi.fn()}
          onBackToScript={vi.fn()}
        />
      );
      await expectNoA11yViolations(container);
      unmount();
    }
    const { container } = render(
      <StudioAnswerCue question='What does this song mean to you?' />
    );
    await expectNoA11yViolations(container);
  });
});
