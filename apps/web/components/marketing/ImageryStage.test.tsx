import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { ImageryStage } from './ImageryStage';

describe('ImageryStage', () => {
  it('renders the art with its alt text and the shared frame class', async () => {
    const { container } = render(
      <ImageryStage
        src='/img/releases/tomorrow-sounds.jpg'
        alt='Tomorrow Sounds cover art'
        width={276}
        height={276}
        className='extra'
      />
    );
    expect(
      screen.getByRole('img', { name: 'Tomorrow Sounds cover art' })
    ).toHaveClass('imagery-stage__img', 'extra');
    await expectNoA11yViolations(container);
  });
});
