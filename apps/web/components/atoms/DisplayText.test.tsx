import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { DisplayText } from './DisplayText';

describe('DisplayText', () => {
  it('renders the requested element and keeps its text', () => {
    render(<DisplayText as='h1'>Move your music forward.</DisplayText>);
    expect(
      screen.getByRole('heading', {
        level: 1,
        name: 'Move your music forward.',
      })
    ).toHaveClass('display-text');
  });

  it('defaults to an h2 and merges the caller class', () => {
    render(<DisplayText className='extra'>One name.</DisplayText>);
    expect(screen.getByRole('heading', { level: 2 })).toHaveClass(
      'display-text',
      'extra'
    );
  });
});
