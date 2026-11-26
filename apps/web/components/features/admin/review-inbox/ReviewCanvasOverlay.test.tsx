import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ReviewCanvasOverlay } from './ReviewCanvasOverlay';

const stroke = {
  id: 's1',
  points: [
    [0.1, 0.2],
    [0.3, 0.4],
  ] as const,
};

describe('ReviewCanvasOverlay', () => {
  it('draws strokes in normalized space and positions pins by percentage', () => {
    render(
      <div className='relative'>
        <ReviewCanvasOverlay
          savedStrokes={[stroke]}
          draftStrokes={[]}
          activeStroke={null}
          pins={[
            {
              id: 'p1',
              x: 0.25,
              y: 0.75,
              note: 'Crop',
              author: 'founder',
              label: 1,
            },
          ]}
          stale={false}
        />
      </div>
    );
    const [line] = screen.getAllByTestId('review-canvas-stroke');
    expect(line).toHaveAttribute('points', '0.1,0.2 0.3,0.4');
    expect(line).not.toHaveAttribute('stroke-dasharray');
    expect(screen.getByTestId('review-canvas-pin')).toHaveStyle({
      left: '25%',
      top: '75%',
    });
  });

  it('dims and dashes saved marks when they are stale', () => {
    render(
      <ReviewCanvasOverlay
        savedStrokes={[stroke]}
        draftStrokes={[]}
        activeStroke={null}
        pins={[]}
        stale
      />
    );
    const [line] = screen.getAllByTestId('review-canvas-stroke');
    expect(line).toHaveAttribute('stroke-dasharray', '6 6');
    expect(line).toHaveAttribute('opacity', '0.5');
  });
});
