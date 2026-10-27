import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { CompactGlassModule } from './CompactGlassModule';
import storyMeta, { Default, Labeled } from './CompactGlassModule.stories';

describe('CompactGlassModule', () => {
  it('renders children inside the shared compact-glass material', () => {
    render(
      <CompactGlassModule>
        <p>Module body</p>
      </CompactGlassModule>
    );

    const moduleEl = document.querySelector('.compact-glass-module');
    expect(moduleEl).toBeInTheDocument();
    expect(screen.getByText('Module body')).toBeInTheDocument();
    expect(
      document.querySelector('.compact-glass-module__label')
    ).not.toBeInTheDocument();
  });

  it('renders the optional label only when provided', () => {
    render(
      <CompactGlassModule label='Fan updates'>
        <p>Module body</p>
      </CompactGlassModule>
    );

    expect(screen.getByText('Fan updates')).toHaveClass(
      'compact-glass-module__label'
    );
  });

  it('merges className onto the module shell', () => {
    render(
      <CompactGlassModule className='w-full'>
        <p>Module body</p>
      </CompactGlassModule>
    );

    expect(document.querySelector('.compact-glass-module')).toHaveClass(
      'w-full'
    );
  });

  it('binds the storybook receipt to the module', () => {
    expect(storyMeta.component).toBe(CompactGlassModule);
    expect(Default).toBeDefined();
    expect(Labeled.args?.label).toBe('Fan updates');
  });
});
