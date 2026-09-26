import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { CompactGlassModule } from './CompactGlassModule';
import storyMeta, { Default, WithLabel } from './CompactGlassModule.stories';

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

  it('renders the optional label when provided', () => {
    render(
      <CompactGlassModule label='Compact glass'>content</CompactGlassModule>
    );

    expect(screen.getByText('Compact glass')).toHaveClass(
      'compact-glass-module__label'
    );
  });

  it('merges className onto the module element', () => {
    render(<CompactGlassModule className='extra'>content</CompactGlassModule>);

    expect(document.querySelector('.compact-glass-module')).toHaveClass(
      'extra'
    );
  });

  it('binds the storybook receipt to the module states', () => {
    expect(storyMeta.component).toBe(CompactGlassModule);
    expect(Default).toBeDefined();
    expect(WithLabel.args?.label).toBe('Compact glass');
  });
});
