import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { CopyToggleIcon } from '../CopyToggleIcon';

describe('CopyToggleIcon', () => {
  it('renders the copy icon when copied is false', () => {
    const { container } = render(<CopyToggleIcon copied={false} />);
    const svg = container.querySelector('svg');
    expect(svg).not.toBeNull();
    // lucide-react adds a class with the icon name; cheap signal that we got
    // the right icon without coupling to internal markup.
    expect(svg?.getAttribute('class')).toContain('lucide-copy');
  });

  it('renders the check icon when copied is true', () => {
    const { container } = render(<CopyToggleIcon copied={true} />);
    const svg = container.querySelector('svg');
    expect(svg?.getAttribute('class')).toContain('lucide-circle-check');
  });

  it('applies cyan tint to the check icon for copied state', () => {
    const { container } = render(<CopyToggleIcon copied={true} />);
    const svg = container.querySelector('svg');
    expect(svg?.getAttribute('class')).toContain('text-cyan-300');
  });

  it('forwards className to the rendered icon', () => {
    const { container } = render(
      <CopyToggleIcon copied={false} className='custom-class' />
    );
    const svg = container.querySelector('svg');
    expect(svg?.getAttribute('class')).toContain('custom-class');
  });

  it('respects a custom size override', () => {
    const { container } = render(
      <CopyToggleIcon copied={false} size='h-5 w-5' />
    );
    const svg = container.querySelector('svg');
    expect(svg?.getAttribute('class')).toContain('h-5');
    expect(svg?.getAttribute('class')).toContain('w-5');
  });
});
