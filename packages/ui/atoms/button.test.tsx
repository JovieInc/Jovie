import { render, screen } from '@testing-library/react';
import * as React from 'react';
import { describe, expect, it } from 'vitest';

import { Button } from './button';

describe('Button', () => {
  it('renders with text', () => {
    render(<Button>Press</Button>);
    expect(screen.getByRole('button', { name: 'Press' })).toBeInTheDocument();
  });

  it('forwards refs', () => {
    const ref = React.createRef<HTMLButtonElement>();
    render(<Button ref={ref}>Hi</Button>);
    expect(ref.current).toBeInstanceOf(HTMLButtonElement);
  });

  it('supports asChild', () => {
    render(
      <Button asChild>
        <a href='https://example.com'>Link</a>
      </Button>
    );
    expect(screen.getByRole('link')).toBeInTheDocument();
  });
});
