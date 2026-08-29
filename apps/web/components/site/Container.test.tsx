import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Container } from './Container';

describe('Container', () => {
  it.each([
    ['sm', 'max-w-3xl'],
    ['md', 'max-w-5xl'],
    ['lg', 'max-w-public-content'],
    ['xl', 'max-w-public-content'],
    ['homepage', 'max-w-public-content'],
    ['full', 'max-w-none'],
  ] as const)('maps the %s size to its canonical width class', (size, width) => {
    const { container } = render(
      <Container size={size}>
        <span>content</span>
      </Container>
    );

    expect(container.firstElementChild).toHaveClass('mx-auto', 'px-5', width);
    expect(container.firstElementChild).toHaveTextContent('content');
  });

  it('uses the public-content width by default and merges instance classes', () => {
    const { container } = render(
      <Container className='text-primary-token'>default content</Container>
    );

    expect(container.firstElementChild).toHaveClass(
      'max-w-public-content',
      'text-primary-token'
    );
  });
});
