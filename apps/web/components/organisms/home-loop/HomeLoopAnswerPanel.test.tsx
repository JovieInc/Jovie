import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { HomeLoopAnswerPanel } from './HomeLoopAnswerPanel';

describe('HomeLoopAnswerPanel', () => {
  it('bounds history navigation and exposes every control by name', () => {
    const handlers = {
      onBack: vi.fn(),
      onForward: vi.fn(),
      onHome: vi.fn(),
      onOpenTranscript: vi.fn(),
    };
    render(
      <HomeLoopAnswerPanel
        prompt='Status?'
        reply='All green.'
        pending={false}
        position={1}
        total={2}
        {...handlers}
      />
    );
    expect(
      screen.getByRole('button', { name: 'Previous Answer' })
    ).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Next Answer' }));
    fireEvent.click(screen.getByRole('button', { name: 'Open Conversation' }));
    fireEvent.click(screen.getByRole('button', { name: 'Back To Home' }));
    expect(handlers.onForward).toHaveBeenCalledOnce();
    expect(handlers.onOpenTranscript).toHaveBeenCalledOnce();
    expect(handlers.onHome).toHaveBeenCalledOnce();
    expect(screen.getByTestId('home-loop-answer')).toHaveTextContent('1 of 2');
    expect(screen.getByTestId('home-loop-answer')).toHaveAttribute(
      'data-surface',
      'panel'
    );
  });

  it('flat surface drops card chrome for Story First melt', () => {
    render(
      <HomeLoopAnswerPanel
        prompt='Why is checkout blocked?'
        reply='Entitlement after payment is uncertified.'
        pending={false}
        position={1}
        total={1}
        onBack={vi.fn()}
        onForward={vi.fn()}
        onHome={vi.fn()}
        onOpenTranscript={vi.fn()}
        surface='flat'
      />
    );
    const panel = screen.getByTestId('home-loop-answer');
    expect(panel).toHaveAttribute('data-surface', 'flat');
    expect(panel.className).not.toMatch(/border-subtle/);
    expect(panel.className).not.toMatch(/bg-surface-1/);
  });
});
