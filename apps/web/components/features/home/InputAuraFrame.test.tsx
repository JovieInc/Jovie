import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { InputAuraFrame } from './InputAuraFrame';

describe('InputAuraFrame', () => {
  it('exposes a public editorial treatment without group/aura internals', () => {
    render(
      <InputAuraFrame treatment='editorial'>
        <input aria-label='Name' />
      </InputAuraFrame>
    );

    const frame = document.querySelector('.input-aura-frame--editorial');
    expect(frame).toBeInTheDocument();
    expect(frame).toHaveAttribute('data-aura-treatment', 'editorial');
    expect(frame).not.toHaveClass('group/aura');
    expect(
      frame?.querySelector('.input-aura-frame__illumination')
    ).toHaveAttribute('aria-hidden', 'true');
    expect(screen.getByLabelText('Name')).toBeInTheDocument();
  });

  it('keeps the default conic treatment off the editorial path', () => {
    const { rerender } = render(
      <InputAuraFrame>
        <input aria-label='Default' />
      </InputAuraFrame>
    );

    const defaultFrame = document.querySelector(
      '[data-aura-treatment="default"]'
    );
    expect(defaultFrame).toHaveClass('group/aura');
    expect(defaultFrame).not.toHaveClass('input-aura-frame--editorial');
    expect(
      defaultFrame?.querySelector('.input-aura-frame__illumination')?.className
    ).toContain('conic-gradient');

    rerender(
      <InputAuraFrame treatment='editorial'>
        <input aria-label='Editorial' />
      </InputAuraFrame>
    );

    const editorialLight = document.querySelector(
      '.input-aura-frame--editorial > .input-aura-frame__illumination'
    );
    expect(editorialLight?.className).not.toContain('conic-gradient');
    expect(editorialLight?.className).not.toContain('rotate-[442deg]');
  });

  it('lets the pill input own keyboard focus, not the frame (JOV-6946)', () => {
    const frameCss = readFileSync(
      resolve(__dirname, './InputAuraFrame.css'),
      'utf8'
    );
    const homeCss = readFileSync(
      resolve(__dirname, '../../../app/(home)/home.css'),
      'utf8'
    );
    // The frame never paints focus; the input fills the pill and rings it.
    expect(frameCss).not.toContain(':has(:focus-visible)');
    expect(homeCss).toMatch(
      /\.homepage-name-search__input:focus-visible\s*\{[^}]*box-shadow:\s*inset/
    );
    expect(homeCss).toMatch(
      /\.homepage-name-search__field \.homepage-name-search__input\s*\{[^}]*inset:\s*0;/
    );
  });
});
