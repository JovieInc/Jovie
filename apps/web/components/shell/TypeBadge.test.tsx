import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { TypeBadge } from './TypeBadge';

describe('TypeBadge', () => {
  it.each(['single', 'Music Video', 'EP'])(
    'renders %s with Title Case and normal tracking',
    authoredLabel => {
      render(<TypeBadge label={authoredLabel} />);
      const label = screen.getByText(authoredLabel);
      expect(label).toBeInTheDocument();
      expect(label).toHaveClass('capitalize', 'tracking-normal', 'h-4');
      expect(label).not.toHaveClass('uppercase');
      expect(label.className).not.toMatch(/tracking-\[/);
    }
  );

  it('forwards custom classNames to the chip', () => {
    const { container } = render(
      <TypeBadge label='ep' className='custom-tone' />
    );
    expect((container.firstElementChild as HTMLElement).className).toContain(
      'custom-tone'
    );
  });
});

describe('JOV-5466 token retire', () => {
  it('does not keep retired --linear-app-* tokens', () => {
    const source = readFileSync(resolve(__dirname, './TypeBadge.tsx'), 'utf8');
    expect(source).not.toMatch(/--linear-app-/);
  });
});
