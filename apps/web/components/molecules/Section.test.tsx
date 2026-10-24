import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Section } from './Section';

describe('Section', () => {
  it('puts its content on the single public container by default', () => {
    const { container } = render(
      <Section containerClassName='text-primary-token'>content</Section>
    );

    const box = container.querySelector('section > div');
    expect(box).toHaveClass('public-container', 'text-primary-token');
    expect(box).not.toHaveClass('public-container--bleed');
    expect(box).toHaveTextContent('content');
  });

  it('offers the one full-bleed override', () => {
    const { container } = render(
      <Section containerSize='bleed'>content</Section>
    );

    expect(container.querySelector('section > div')).toHaveClass(
      'public-container',
      'public-container--bleed'
    );
  });
});
