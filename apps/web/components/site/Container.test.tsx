import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Container } from './Container';

describe('Container', () => {
  it('is the single boxed public width by default and merges instance classes', () => {
    const { container } = render(
      <Container className='text-primary-token'>default content</Container>
    );

    expect(container.firstElementChild).toHaveClass(
      'public-container',
      'text-primary-token'
    );
    expect(container.firstElementChild).not.toHaveClass(
      'public-container--bleed'
    );
    expect(container.firstElementChild).toHaveTextContent('default content');
  });

  it('offers exactly one override: full bleed', () => {
    const { container } = render(
      <Container size='bleed'>
        <span>content</span>
      </Container>
    );

    expect(container.firstElementChild).toHaveClass(
      'public-container',
      'public-container--bleed'
    );
  });
});
